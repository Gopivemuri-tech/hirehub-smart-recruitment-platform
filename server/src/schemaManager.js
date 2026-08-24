import "dotenv/config";

import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";

import {
  getDatabaseConfig
} from "./config/database.js";

function q(value) {
  return `\`${String(value).replace(/`/g, "")}\``;
}

function normalizeKey(value) {
  return String(value || "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

function rowMap(row) {
  const map = new Map();

  for (const [key, value] of Object.entries(row)) {
    map.set(normalizeKey(key), value);
  }

  return map;
}

function pick(map, names, fallback = null) {
  for (const name of names) {
    const key = normalizeKey(name);

    if (map.has(key)) {
      const value = map.get(key);

      if (
        value !== undefined &&
        value !== null
      ) {
        return value;
      }
    }
  }

  return fallback;
}

function metaValue(row, names, fallback = null) {
  return pick(
    rowMap(row || {}),
    Array.isArray(names) ? names : [names],
    fallback
  );
}

function countValue(row) {
  return Number(
    metaValue(
      row,
      ["c", "count", "count(*)"],
      0
    )
  ) || 0;
}

async function tableExists(
  connection,
  database,
  table
) {
  const [[row]] =
    await connection.query(
      `SELECT COUNT(*) AS c
         FROM information_schema.tables
        WHERE table_schema = ?
          AND table_name = ?`,
      [database, table]
    );

  return countValue(row) > 0;
}

async function columnsFor(
  connection,
  database,
  table
) {
  if (
    !(await tableExists(
      connection,
      database,
      table
    ))
  ) {
    return new Set();
  }

  const [rows] =
    await connection.query(
      `SELECT column_name
         FROM information_schema.columns
        WHERE table_schema = ?
          AND table_name = ?`,
      [database, table]
    );

  return new Set(
    rows
      .map((row) =>
        String(
          metaValue(
            row,
            ["column_name", "columnname"],
            ""
          )
        )
          .trim()
          .toLowerCase()
      )
      .filter(Boolean)
  );
}

async function columnExists(
  connection,
  database,
  table,
  column
) {
  return (
    await columnsFor(
      connection,
      database,
      table
    )
  ).has(
    String(column || "")
      .toLowerCase()
  );
}

async function ensureColumn(
  connection,
  database,
  table,
  column,
  definition
) {
  if (
    await columnExists(
      connection,
      database,
      table,
      column
    )
  ) {
    return;
  }

  try {
    await connection.query(
      `ALTER TABLE ${q(table)}
       ADD COLUMN ${q(column)} ${definition}`
    );
  } catch (error) {
    /*
      MySQL column names are case-insensitive on the user's Windows setup.
      Older HireHub versions may have created Name/NAME instead of name.
      Treat ER_DUP_FIELDNAME as already present so startup remains idempotent.
    */
    if (
      error?.code === "ER_DUP_FIELDNAME" ||
      Number(error?.errno) === 1060
    ) {
      return;
    }

    throw error;
  }
}

async function foreignKeysForColumn(
  connection,
  database,
  table,
  column
) {
  const [rows] =
    await connection.query(
      `SELECT
         constraint_name,
         referenced_table_name,
         referenced_column_name
       FROM information_schema.key_column_usage
       WHERE table_schema = ?
         AND table_name = ?
         AND column_name = ?
         AND referenced_table_name IS NOT NULL`,
      [
        database,
        table,
        column
      ]
    );

  return rows
    .map((row) => ({
      constraintName:
        String(
          metaValue(
            row,
            ["constraint_name", "constraintname"],
            ""
          )
        ).trim(),

      referencedTableName:
        String(
          metaValue(
            row,
            [
              "referenced_table_name",
              "referencedtablename"
            ],
            ""
          )
        )
          .trim()
          .toLowerCase(),

      referencedColumnName:
        String(
          metaValue(
            row,
            [
              "referenced_column_name",
              "referencedcolumnname"
            ],
            ""
          )
        )
          .trim()
          .toLowerCase()
    }))
    .filter((row) => row.constraintName);
}

async function dropForeignKeysForColumn(
  connection,
  database,
  table,
  column
) {
  const rows =
    await foreignKeysForColumn(
      connection,
      database,
      table,
      column
    );

  for (const row of rows) {
    const constraintName =
      String(row.constraintName || "").trim();

    if (!constraintName) {
      continue;
    }

    try {
      await connection.query(
        `ALTER TABLE ${q(table)}
         DROP FOREIGN KEY ${q(constraintName)}`
      );
    } catch (error) {
      /*
        If another earlier repair already removed the same FK,
        keep migration idempotent instead of crashing.
      */
      if (
        error?.code === "ER_CANT_DROP_FIELD_OR_KEY" ||
        Number(error?.errno) === 1091
      ) {
        continue;
      }

      throw error;
    }
  }
}

async function ensureIndex(
  connection,
  database,
  table,
  indexName,
  columns,
  unique = false
) {
  const [[row]] =
    await connection.query(
      `SELECT COUNT(*) AS c
         FROM information_schema.statistics
        WHERE table_schema = ?
          AND table_name = ?
          AND index_name = ?`,
      [
        database,
        table,
        indexName
      ]
    );

  if (countValue(row) > 0) {
    return;
  }

  await connection.query(
    `ALTER TABLE ${q(table)}
     ADD ${unique ? "UNIQUE " : ""}
     INDEX ${q(indexName)}
     (${columns.map(q).join(", ")})`
  );
}

async function ensureForeignKey(
  connection,
  database,
  {
    table,
    column,
    referencedTable,
    constraintName,
    onDelete = "RESTRICT"
  }
) {
  const existing =
    await foreignKeysForColumn(
      connection,
      database,
      table,
      column
    );

  const correct =
    existing.some(
      (row) =>
        row.referencedTableName ===
          String(referencedTable || "").toLowerCase() &&
        row.referencedColumnName ===
          "id"
    );

  if (correct) {
    return;
  }

  if (existing.length) {
    await dropForeignKeysForColumn(
      connection,
      database,
      table,
      column
    );
  }

  await connection.query(
    `ALTER TABLE ${q(table)}
     ADD CONSTRAINT ${q(constraintName)}
     FOREIGN KEY (${q(column)})
     REFERENCES ${q(referencedTable)} (${q("id")})
     ON UPDATE CASCADE
     ON DELETE ${onDelete}`
  );
}

async function backupTables(
  connection,
  database
) {
  const tables = [
    "users",
    "admins",
    "recruiters",
    "jobseekers",
    "jobs",
    "applications",
    "external_applications"
  ];

  const backup = {
    database,
    createdAt:
      new Date().toISOString(),
    tables: {}
  };

  for (const table of tables) {
    if (
      !(await tableExists(
        connection,
        database,
        table
      ))
    ) {
      continue;
    }

    const [rows] =
      await connection.query(
        `SELECT * FROM ${q(table)}`
      );

    backup.tables[table] =
      rows;
  }

  const directory =
    path.resolve(
      process.cwd(),
      "database_backup"
    );

  await fs.mkdir(
    directory,
    { recursive: true }
  );

  const stamp =
    new Date()
      .toISOString()
      .replace(/[:.]/g, "-");

  const filePath =
    path.join(
      directory,
      `hirehub-${stamp}.json`
    );

  await fs.writeFile(
    filePath,
    JSON.stringify(
      backup,
      null,
      2
    ),
    "utf8"
  );

  return filePath;
}

async function ensureFinalTables(
  connection,
  database
) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS admins (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(190) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB
      DEFAULT CHARSET=utf8mb4
      COLLATE=utf8mb4_unicode_ci
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS recruiters (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(190) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      company_name VARCHAR(150) NOT NULL DEFAULT '',
      company_website VARCHAR(250) NOT NULL DEFAULT '',
      company_description TEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB
      DEFAULT CHARSET=utf8mb4
      COLLATE=utf8mb4_unicode_ci
  `);

  await connection.query(`
    CREATE TABLE IF NOT EXISTS jobseekers (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(190) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      headline VARCHAR(120) NOT NULL DEFAULT '',
      profile_location VARCHAR(120) NOT NULL DEFAULT '',
      skills JSON NULL,
      bio TEXT NULL,
      experience_level ENUM(
        'Fresher',
        '0-1 years',
        '1-3 years',
        '3+ years'
      ) NOT NULL DEFAULT 'Fresher',
      resume_path VARCHAR(255) NULL,
      original_resume_name VARCHAR(255) NULL,
      preferred_roles JSON NULL,
      preferred_locations JSON NULL,
      preferred_job_types JSON NULL,
      auto_apply_enabled TINYINT(1) NOT NULL DEFAULT 0,
      min_match_score INT UNSIGNED NOT NULL DEFAULT 70,
      max_auto_applications_per_day INT UNSIGNED
        NOT NULL DEFAULT 10,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB
      DEFAULT CHARSET=utf8mb4
      COLLATE=utf8mb4_unicode_ci
  `);

  /*
    Patch partially-created tables from earlier versions.
    This is the part that prevents login SELECT queries from throwing 500.
  */

  const adminColumns = {
    name: "VARCHAR(100) NOT NULL DEFAULT ''",
    email: "VARCHAR(190) NOT NULL DEFAULT ''",
    password_hash: "VARCHAR(255) NOT NULL DEFAULT ''",
    is_active: "TINYINT(1) NOT NULL DEFAULT 1",
    created_at: "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP",
    updated_at:
      "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
  };

  const recruiterColumns = {
    name: "VARCHAR(100) NOT NULL DEFAULT ''",
    email: "VARCHAR(190) NOT NULL DEFAULT ''",
    password_hash: "VARCHAR(255) NOT NULL DEFAULT ''",
    is_active: "TINYINT(1) NOT NULL DEFAULT 1",
    company_name: "VARCHAR(150) NOT NULL DEFAULT ''",
    company_website: "VARCHAR(250) NOT NULL DEFAULT ''",
    company_description: "TEXT NULL",
    created_at: "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP",
    updated_at:
      "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
  };

  const jobseekerColumns = {
    name: "VARCHAR(100) NOT NULL DEFAULT ''",
    email: "VARCHAR(190) NOT NULL DEFAULT ''",
    password_hash: "VARCHAR(255) NOT NULL DEFAULT ''",
    is_active: "TINYINT(1) NOT NULL DEFAULT 1",
    headline: "VARCHAR(120) NOT NULL DEFAULT ''",
    profile_location: "VARCHAR(120) NOT NULL DEFAULT ''",
    skills: "JSON NULL",
    bio: "TEXT NULL",
    experience_level:
      "ENUM('Fresher','0-1 years','1-3 years','3+ years') NOT NULL DEFAULT 'Fresher'",
    resume_path: "VARCHAR(255) NULL",
    original_resume_name: "VARCHAR(255) NULL",
    preferred_roles: "JSON NULL",
    preferred_locations: "JSON NULL",
    preferred_job_types: "JSON NULL",
    auto_apply_enabled: "TINYINT(1) NOT NULL DEFAULT 0",
    min_match_score: "INT UNSIGNED NOT NULL DEFAULT 70",
    max_auto_applications_per_day:
      "INT UNSIGNED NOT NULL DEFAULT 10",
    created_at: "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP",
    updated_at:
      "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
  };

  for (const [column, definition] of Object.entries(adminColumns)) {
    await ensureColumn(
      connection,
      database,
      "admins",
      column,
      definition
    );
  }

  for (const [column, definition] of Object.entries(recruiterColumns)) {
    await ensureColumn(
      connection,
      database,
      "recruiters",
      column,
      definition
    );
  }

  for (const [column, definition] of Object.entries(jobseekerColumns)) {
    await ensureColumn(
      connection,
      database,
      "jobseekers",
      column,
      definition
    );
  }

}

async function ensureRoleIndexes(
  connection,
  database
) {
  const specs = [
    ["admins", "uq_admins_email", ["email"], true],
    ["recruiters", "uq_recruiters_email", ["email"], true],
    ["jobseekers", "uq_jobseekers_email", ["email"], true],
    ["recruiters", "idx_recruiters_active", ["is_active"], false],
    ["jobseekers", "idx_jobseekers_active", ["is_active"], false],
    ["jobseekers", "idx_jobseekers_auto", ["auto_apply_enabled"], false]
  ];

  for (const [
    table,
    name,
    columns,
    unique
  ] of specs) {
    try {
      await ensureIndex(
        connection,
        database,
        table,
        name,
        columns,
        unique
      );
    } catch (error) {
      /*
        Old duplicated email rows should not make the whole app unusable.
        Login still works; a duplicate can be cleaned later.
      */
      console.warn(
        `Index ${name} was not added: ${error.message}`
      );
    }
  }
}

function normalizeRole(value) {
  const role =
    String(value || "")
      .trim()
      .toLowerCase();

  if (
    [
      "admin",
      "administrator",
      "owner"
    ].includes(role)
  ) {
    return "admin";
  }

  if (
    [
      "employer",
      "recruiter",
      "company",
      "jobprovider"
    ].includes(
      role.replace(/\s+/g, "")
    )
  ) {
    return "employer";
  }

  if (
    [
      "jobseeker",
      "candidate",
      "student"
    ].includes(
      role.replace(/\s+/g, "")
    )
  ) {
    return "jobseeker";
  }

  return null;
}

async function validPasswordHash(value) {
  const text =
    String(value || "");

  return (
    text.startsWith("$2a$") ||
    text.startsWith("$2b$") ||
    text.startsWith("$2y$")
  );
}

async function migrateLegacyUsers(
  connection,
  database
) {
  if (
    !(await tableExists(
      connection,
      database,
      "users"
    ))
  ) {
    return {
      recruiterIdMap:
        new Map(),
      jobseekerIdMap:
        new Map()
    };
  }

  const [rows] =
    await connection.query(
      "SELECT * FROM users"
    );

  const recruiterIdMap =
    new Map();

  const jobseekerIdMap =
    new Map();

  for (const row of rows) {
    const map =
      rowMap(row);

    const emailGuess =
      String(
        pick(
          map,
          [
            "email",
            "email_id",
            "emailid",
            "username"
          ],
          ""
        )
      )
        .trim()
        .toLowerCase();

    let role =
      normalizeRole(
        pick(map, [
          "role",
          "user_role",
          "usertype",
          "user_type",
          "account_type"
        ])
      );

    if (!role) {
      const companyGuess =
        String(
          pick(
            map,
            [
              "company_name",
              "companyname"
            ],
            ""
          )
        ).trim();

      if (
        emailGuess.includes("admin")
      ) {
        role = "admin";
      } else if (companyGuess) {
        role = "employer";
      } else if (emailGuess) {
        role = "jobseeker";
      }
    }

    if (!role) {
      continue;
    }

    const oldIdValue =
      pick(
        map,
        [
          "id",
          "user_id",
          "userid",
          "userId",
          "pk"
        ],
        null
      );

    const oldId =
      Number(oldIdValue) > 0
        ? Number(oldIdValue)
        : null;

    const email =
      emailGuess;

    if (!email) {
      continue;
    }

    const name =
      String(
        pick(
          map,
          [
            "name",
            "full_name",
            "fullname",
            "username"
          ],
          email.split("@")[0]
        )
      ).trim();

    const rawHash =
      pick(
        map,
        [
          "password_hash",
          "passwordhash",
          "hashed_password",
          "password"
        ],
        ""
      );

    let passwordHash =
      String(rawHash || "");

    if (
      !(await validPasswordHash(
        passwordHash
      ))
    ) {
      /*
        If an old row used a plain password, preserve its ability to login
        by hashing that value. If no password value exists, use a temporary
        recovery password.
      */
      const plain =
        passwordHash ||
        "HireHub@123";

      passwordHash =
        await bcrypt.hash(
          plain,
          12
        );
    }

    const isActive =
      Boolean(
        Number(
          pick(
            map,
            [
              "is_active",
              "isactive",
              "active"
            ],
            1
          )
        )
      );

    const common = {
      name,
      email,
      passwordHash,
      isActive
    };

    const table =
      role === "admin"
        ? "admins"
        : role === "employer"
          ? "recruiters"
          : "jobseekers";

    const [existingRows] =
      await connection.query(
        `SELECT id
           FROM ${q(table)}
          WHERE email = ?
          LIMIT 1`,
        [email]
      );

    let newId =
      existingRows[0]?.id
        ? Number(existingRows[0].id)
        : null;

    if (!newId) {
      let explicitId = null;

      if (oldId) {
        const [collision] =
          await connection.query(
            `SELECT id
               FROM ${q(table)}
              WHERE id = ?
              LIMIT 1`,
            [oldId]
          );

        if (!collision.length) {
          explicitId = oldId;
        }
      }

      if (role === "admin") {
        const [result] =
          await connection.query(
            `INSERT INTO admins
             (
               ${explicitId ? "id," : ""}
               name,
               email,
               password_hash,
               is_active
             )
             VALUES
             (
               ${explicitId ? "?," : ""}
               ?, ?, ?, ?
             )`,
            [
              ...(explicitId
                ? [explicitId]
                : []),
              common.name,
              common.email,
              common.passwordHash,
              common.isActive
            ]
          );

        newId =
          explicitId ||
          Number(result.insertId);
      }

      if (role === "employer") {
        const companyName =
          String(
            pick(
              map,
              [
                "company_name",
                "companyname"
              ],
              ""
            )
          ).trim();

        const companyWebsite =
          String(
            pick(
              map,
              [
                "company_website",
                "companywebsite"
              ],
              ""
            )
          ).trim();

        const companyDescription =
          String(
            pick(
              map,
              [
                "company_description",
                "companydescription"
              ],
              ""
            )
          );

        const [result] =
          await connection.query(
            `INSERT INTO recruiters
             (
               ${explicitId ? "id," : ""}
               name,
               email,
               password_hash,
               is_active,
               company_name,
               company_website,
               company_description
             )
             VALUES
             (
               ${explicitId ? "?," : ""}
               ?, ?, ?, ?, ?, ?, ?
             )`,
            [
              ...(explicitId
                ? [explicitId]
                : []),
              common.name,
              common.email,
              common.passwordHash,
              common.isActive,
              companyName,
              companyWebsite,
              companyDescription
            ]
          );

        newId =
          explicitId ||
          Number(result.insertId);
      }

      if (role === "jobseeker") {
        const asJson = (
          names,
          fallback = []
        ) => {
          const value =
            pick(
              map,
              names,
              fallback
            );

          if (
            Array.isArray(value)
          ) {
            return JSON.stringify(value);
          }

          if (
            typeof value === "string"
          ) {
            try {
              JSON.parse(value);
              return value;
            } catch {
              return JSON.stringify(
                value
                  .split(",")
                  .map((x) =>
                    x.trim()
                  )
                  .filter(Boolean)
              );
            }
          }

          return JSON.stringify(
            fallback
          );
        };

        const [result] =
          await connection.query(
            `INSERT INTO jobseekers
             (
               ${explicitId ? "id," : ""}
               name,
               email,
               password_hash,
               is_active,
               headline,
               profile_location,
               skills,
               bio,
               experience_level,
               resume_path,
               original_resume_name,
               preferred_roles,
               preferred_locations,
               preferred_job_types,
               auto_apply_enabled,
               min_match_score,
               max_auto_applications_per_day
             )
             VALUES
             (
               ${explicitId ? "?," : ""}
               ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
             )`,
            [
              ...(explicitId
                ? [explicitId]
                : []),
              common.name,
              common.email,
              common.passwordHash,
              common.isActive,
              String(
                pick(
                  map,
                  ["headline"],
                  ""
                )
              ),
              String(
                pick(
                  map,
                  [
                    "profile_location",
                    "profilelocation",
                    "location"
                  ],
                  ""
                )
              ),
              asJson(["skills"]),
              String(
                pick(
                  map,
                  ["bio"],
                  ""
                )
              ),
              String(
                pick(
                  map,
                  [
                    "experience_level",
                    "experiencelevel"
                  ],
                  "Fresher"
                )
              ),
              pick(
                map,
                [
                  "resume_path",
                  "resumepath"
                ],
                null
              ),
              pick(
                map,
                [
                  "original_resume_name",
                  "originalresumename"
                ],
                null
              ),
              asJson([
                "preferred_roles",
                "preferredroles"
              ]),
              asJson([
                "preferred_locations",
                "preferredlocations"
              ]),
              asJson([
                "preferred_job_types",
                "preferredjobtypes"
              ]),
              Number(
                pick(
                  map,
                  [
                    "auto_apply_enabled",
                    "autoapplyenabled"
                  ],
                  0
                )
              )
                ? 1
                : 0,
              Math.min(
                100,
                Math.max(
                  30,
                  Number(
                    pick(
                      map,
                      [
                        "min_match_score",
                        "minmatchscore"
                      ],
                      70
                    )
                  )
                )
              ),
              Math.min(
                50,
                Math.max(
                  1,
                  Number(
                    pick(
                      map,
                      [
                        "max_auto_applications_per_day",
                        "maxautoapplicationsperday"
                      ],
                      10
                    )
                  )
                )
              )
            ]
          );

        newId =
          explicitId ||
          Number(result.insertId);
      }
    }

    if (
      oldId &&
      role === "employer"
    ) {
      recruiterIdMap.set(
        oldId,
        newId
      );
    }

    if (
      oldId &&
      role === "jobseeker"
    ) {
      jobseekerIdMap.set(
        oldId,
        newId
      );
    }
  }

  return {
    recruiterIdMap,
    jobseekerIdMap
  };
}

async function ensureDefaultAdmin(
  connection
) {
  const [[row]] =
    await connection.query(
      "SELECT COUNT(*) AS c FROM admins"
    );

  if (countValue(row) > 0) {
    return;
  }

  const passwordHash =
    await bcrypt.hash(
      "Admin@123",
      12
    );

  await connection.query(
    `INSERT INTO admins
     (
       name,
       email,
       password_hash,
       is_active
     )
     VALUES (?, ?, ?, 1)`,
    [
      "HireHub Admin",
      "admin@hirehub.demo",
      passwordHash
    ]
  );
}

async function ensureRecoveredRecruiter(
  connection,
  requestedId = null
) {
  if (requestedId) {
    const [existing] =
      await connection.query(
        `SELECT id
           FROM recruiters
          WHERE id = ?
          LIMIT 1`,
        [requestedId]
      );

    if (existing.length) {
      return Number(
        existing[0].id
      );
    }
  }

  const [byEmail] =
    await connection.query(
      `SELECT id
         FROM recruiters
        WHERE email = ?
        LIMIT 1`,
      [
        "employer@hirehub.demo"
      ]
    );

  if (byEmail.length) {
    return Number(
      byEmail[0].id
    );
  }

  const passwordHash =
    await bcrypt.hash(
      "Employer@123",
      12
    );

  if (requestedId) {
    try {
      await connection.query(
        `INSERT INTO recruiters
         (
           id,
           name,
           email,
           password_hash,
           is_active,
           company_name,
           company_description
         )
         VALUES (?, ?, ?, ?, 1, ?, ?)`,
        [
          requestedId,
          "Recovered Recruiter",
          `recovered-recruiter-${requestedId}@hirehub.local`,
          passwordHash,
          "Recovered Company",
          "Recovered from the previous HireHub database."
        ]
      );

      return requestedId;
    } catch {
      /* fall through to normal demo recruiter */
    }
  }

  const [result] =
    await connection.query(
      `INSERT INTO recruiters
       (
         name,
         email,
         password_hash,
         is_active,
         company_name,
         company_description
       )
       VALUES (?, ?, ?, 1, ?, ?)`,
      [
        "Demo Recruiter",
        "employer@hirehub.demo",
        passwordHash,
        "HireHub Demo Company",
        "Recruiter account created while repairing existing job ownership."
      ]
    );

  return Number(
    result.insertId
  );
}

async function ensureJobs(
  connection,
  database,
  recruiterIdMap
) {
  if (
    !(await tableExists(
      connection,
      database,
      "jobs"
    ))
  ) {
    await connection.query(`
      CREATE TABLE jobs (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        recruiter_id INT UNSIGNED NOT NULL,
        title VARCHAR(150) NOT NULL,
        description LONGTEXT NOT NULL,
        location VARCHAR(150) NOT NULL,
        skills JSON NULL,
        type ENUM(
          'Full-time',
          'Part-time',
          'Internship',
          'Contract',
          'Remote'
        ) NOT NULL,
        experience_level ENUM(
          'Fresher',
          '0-1 years',
          '1-3 years',
          '3+ years'
        ) NOT NULL DEFAULT 'Fresher',
        salary_min INT UNSIGNED NOT NULL DEFAULT 0,
        salary_max INT UNSIGNED NOT NULL DEFAULT 0,
        company_name VARCHAR(150) NOT NULL DEFAULT '',
        status ENUM('active','closed') NOT NULL DEFAULT 'active',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
          ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB
        DEFAULT CHARSET=utf8mb4
        COLLATE=utf8mb4_unicode_ci
    `);
  }

  const definitions = {
    recruiter_id: "INT UNSIGNED NULL",
    title: "VARCHAR(150) NOT NULL DEFAULT ''",
    description: "LONGTEXT NULL",
    location: "VARCHAR(150) NOT NULL DEFAULT ''",
    skills: "JSON NULL",
    type:
      "ENUM('Full-time','Part-time','Internship','Contract','Remote') NOT NULL DEFAULT 'Full-time'",
    experience_level:
      "ENUM('Fresher','0-1 years','1-3 years','3+ years') NOT NULL DEFAULT 'Fresher'",
    salary_min: "INT UNSIGNED NOT NULL DEFAULT 0",
    salary_max: "INT UNSIGNED NOT NULL DEFAULT 0",
    company_name: "VARCHAR(150) NOT NULL DEFAULT ''",
    status:
      "ENUM('active','closed') NOT NULL DEFAULT 'active'",
    created_at:
      "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP",
    updated_at:
      "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
  };

  for (const [
    column,
    definition
  ] of Object.entries(
    definitions
  )) {
    await ensureColumn(
      connection,
      database,
      "jobs",
      column,
      definition
    );
  }

  const columns =
    await columnsFor(
      connection,
      database,
      "jobs"
    );

  const [jobs] =
    await connection.query(
      "SELECT * FROM jobs"
    );

  for (const job of jobs) {
    if (
      Number(job.recruiter_id) > 0
    ) {
      const [valid] =
        await connection.query(
          `SELECT id
             FROM recruiters
            WHERE id = ?
            LIMIT 1`,
          [
            Number(
              job.recruiter_id
            )
          ]
        );

      if (valid.length) {
        continue;
      }
    }

    const oldOwner =
      columns.has("employer_id")
        ? Number(job.employer_id || 0)
        : 0;

    let recruiterId =
      oldOwner
        ? recruiterIdMap.get(
            oldOwner
          )
        : null;

    if (!recruiterId) {
      recruiterId =
        await ensureRecoveredRecruiter(
          connection,
          oldOwner || null
        );
    }

    await connection.query(
      `UPDATE jobs
          SET recruiter_id = ?
        WHERE id = ?`,
      [
        recruiterId,
        job.id
      ]
    );
  }

  const [[orphans]] =
    await connection.query(`
      SELECT COUNT(*) AS c
        FROM jobs j
        LEFT JOIN recruiters r
          ON r.id = j.recruiter_id
       WHERE j.recruiter_id IS NULL
          OR r.id IS NULL
    `);

  if (
    Number(orphans?.c || 0) > 0
  ) {
    throw new Error(
      "Unable to safely connect all existing jobs to recruiter accounts."
    );
  }

  await connection.query(
    `ALTER TABLE jobs
     MODIFY recruiter_id
       INT UNSIGNED NOT NULL`
  );

  await ensureIndex(
    connection,
    database,
    "jobs",
    "idx_jobs_recruiter",
    ["recruiter_id"]
  );

  await ensureForeignKey(
    connection,
    database,
    {
      table: "jobs",
      column: "recruiter_id",
      referencedTable:
        "recruiters",
      constraintName:
        "fk_jobs_recruiter",
      onDelete:
        "RESTRICT"
    }
  );

  /*
    Remove old owner column only after all rows have been mapped.
  */
  if (
    columns.has("employer_id")
  ) {
    await dropForeignKeysForColumn(
      connection,
      database,
      "jobs",
      "employer_id"
    );

    await connection.query(
      "ALTER TABLE jobs DROP COLUMN employer_id"
    );
  }
}

async function ensureRecoveredJobseeker(
  connection,
  requestedId
) {
  const [existing] =
    await connection.query(
      `SELECT id
         FROM jobseekers
        WHERE id = ?
        LIMIT 1`,
      [requestedId]
    );

  if (existing.length) {
    return requestedId;
  }

  const passwordHash =
    await bcrypt.hash(
      "Candidate@123",
      12
    );

  try {
    await connection.query(
      `INSERT INTO jobseekers
       (
         id,
         name,
         email,
         password_hash,
         is_active
       )
       VALUES (?, ?, ?, ?, 1)`,
      [
        requestedId,
        "Recovered Candidate",
        `recovered-candidate-${requestedId}@hirehub.local`,
        passwordHash
      ]
    );

    return requestedId;
  } catch {
    const [result] =
      await connection.query(
        `INSERT INTO jobseekers
         (
           name,
           email,
           password_hash,
           is_active
         )
         VALUES (?, ?, ?, 1)`,
        [
          "Recovered Candidate",
          `recovered-candidate-${requestedId}-${crypto.randomUUID()}@hirehub.local`,
          passwordHash
        ]
      );

    return Number(
      result.insertId
    );
  }
}

async function ensureApplications(
  connection,
  database,
  jobseekerIdMap
) {
  if (
    !(await tableExists(
      connection,
      database,
      "applications"
    ))
  ) {
    await connection.query(`
      CREATE TABLE applications (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        job_id INT UNSIGNED NOT NULL,
        jobseeker_id INT UNSIGNED NOT NULL,
        resume_path VARCHAR(255) NOT NULL DEFAULT '',
        original_resume_name VARCHAR(255) NOT NULL DEFAULT '',
        cover_letter TEXT NULL,
        application_method ENUM(
          'manual',
          'auto'
        ) NOT NULL DEFAULT 'manual',
        match_score INT UNSIGNED NOT NULL DEFAULT 0,
        match_breakdown JSON NULL,
        status ENUM(
          'applied',
          'reviewing',
          'shortlisted',
          'interview',
          'selected',
          'rejected',
          'hired'
        ) NOT NULL DEFAULT 'applied',
        applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
          ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB
        DEFAULT CHARSET=utf8mb4
        COLLATE=utf8mb4_unicode_ci
    `);
  }

  const definitions = {
    job_id: "INT UNSIGNED NULL",
    jobseeker_id: "INT UNSIGNED NULL",
    resume_path: "VARCHAR(255) NOT NULL DEFAULT ''",
    original_resume_name:
      "VARCHAR(255) NOT NULL DEFAULT ''",
    cover_letter: "TEXT NULL",
    application_method:
      "ENUM('manual','auto') NOT NULL DEFAULT 'manual'",
    match_score:
      "INT UNSIGNED NOT NULL DEFAULT 0",
    match_breakdown: "JSON NULL",
    status:
      "ENUM('applied','reviewing','shortlisted','interview','selected','rejected','hired') NOT NULL DEFAULT 'applied'",
    applied_at:
      "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP",
    created_at:
      "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP",
    updated_at:
      "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
  };

  for (const [
    column,
    definition
  ] of Object.entries(
    definitions
  )) {
    await ensureColumn(
      connection,
      database,
      "applications",
      column,
      definition
    );
  }

  // Expand the native recruiter workflow without deleting legacy values.
  await connection.query(`
    ALTER TABLE applications
    MODIFY status ENUM(
      'applied',
      'reviewing',
      'shortlisted',
      'interview',
      'selected',
      'rejected',
      'hired'
    ) NOT NULL DEFAULT 'applied'
  `);

  const [applications] =
    await connection.query(
      "SELECT * FROM applications"
    );

  for (const application of applications) {
    const oldId =
      Number(
        application.jobseeker_id ||
        0
      );

    if (!oldId) {
      continue;
    }

    const [valid] =
      await connection.query(
        `SELECT id
           FROM jobseekers
          WHERE id = ?
          LIMIT 1`,
        [oldId]
      );

    if (valid.length) {
      continue;
    }

    let newId =
      jobseekerIdMap.get(
        oldId
      );

    if (!newId) {
      newId =
        await ensureRecoveredJobseeker(
          connection,
          oldId
        );
    }

    await connection.query(
      `UPDATE applications
          SET jobseeker_id = ?
        WHERE id = ?`,
      [
        newId,
        application.id
      ]
    );
  }

  const [[badJobs]] =
    await connection.query(`
      SELECT COUNT(*) AS c
        FROM applications a
        LEFT JOIN jobs j
          ON j.id = a.job_id
       WHERE a.job_id IS NULL
          OR j.id IS NULL
    `);

  if (
    Number(badJobs?.c || 0) > 0
  ) {
    throw new Error(
      "An application references a missing job. Data was backed up; automatic cleanup was not performed."
    );
  }

  const [[badCandidates]] =
    await connection.query(`
      SELECT COUNT(*) AS c
        FROM applications a
        LEFT JOIN jobseekers j
          ON j.id = a.jobseeker_id
       WHERE a.jobseeker_id IS NULL
          OR j.id IS NULL
    `);

  if (
    Number(
      badCandidates?.c ||
      0
    ) > 0
  ) {
    throw new Error(
      "Unable to safely connect all applications to candidate accounts."
    );
  }

  await connection.query(
    `ALTER TABLE applications
     MODIFY job_id
       INT UNSIGNED NOT NULL,
     MODIFY jobseeker_id
       INT UNSIGNED NOT NULL`
  );

  await ensureIndex(
    connection,
    database,
    "applications",
    "idx_applications_job",
    ["job_id"]
  );

  await ensureIndex(
    connection,
    database,
    "applications",
    "idx_applications_jobseeker",
    ["jobseeker_id"]
  );

  try {
    await ensureIndex(
      connection,
      database,
      "applications",
      "uq_applications_job_candidate",
      [
        "job_id",
        "jobseeker_id"
      ],
      true
    );
  } catch (error) {
    console.warn(
      `Duplicate application index was not added: ${error.message}`
    );
  }

  await ensureForeignKey(
    connection,
    database,
    {
      table:
        "applications",
      column:
        "job_id",
      referencedTable:
        "jobs",
      constraintName:
        "fk_applications_job",
      onDelete:
        "CASCADE"
    }
  );

  await ensureForeignKey(
    connection,
    database,
    {
      table:
        "applications",
      column:
        "jobseeker_id",
      referencedTable:
        "jobseekers",
      constraintName:
        "fk_applications_jobseeker",
      onDelete:
        "RESTRICT"
    }
  );
}


async function ensureExternalApplications(
  connection,
  database
) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS external_applications (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT,
      jobseeker_id INT UNSIGNED NOT NULL,
      external_job_key VARCHAR(64) NOT NULL,
      external_id TEXT NULL,
      job_title VARCHAR(255) NOT NULL,
      company_name VARCHAR(255) NOT NULL DEFAULT '',
      location VARCHAR(255) NOT NULL DEFAULT '',
      source VARCHAR(80) NOT NULL DEFAULT 'external',
      source_label VARCHAR(160) NOT NULL DEFAULT 'External',
      apply_url TEXT NOT NULL,
      apply_options JSON NULL,
      match_score INT UNSIGNED NOT NULL DEFAULT 0,
      status VARCHAR(32) NOT NULL DEFAULT 'saved',
      applied_at DATETIME NULL,
      last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB
      DEFAULT CHARSET=utf8mb4
      COLLATE=utf8mb4_unicode_ci
  `);

  /*
    External tracking used an ENUM in an earlier patch.
    That can produce "Data truncated for column status" when a running
    database has an older ENUM definition. Use VARCHAR here so future
    status additions remain backward-compatible and no manual migration
    is required.
  */
  const definitions = {
    jobseeker_id: "INT UNSIGNED NOT NULL",
    external_job_key: "VARCHAR(64) NOT NULL",
    external_id: "TEXT NULL",
    job_title: "VARCHAR(255) NOT NULL",
    company_name: "VARCHAR(255) NOT NULL DEFAULT ''",
    location: "VARCHAR(255) NOT NULL DEFAULT ''",
    source: "VARCHAR(80) NOT NULL DEFAULT 'external'",
    source_label: "VARCHAR(160) NOT NULL DEFAULT 'External'",
    apply_url: "TEXT NOT NULL",
    apply_options: "JSON NULL",
    match_score: "INT UNSIGNED NOT NULL DEFAULT 0",
    status: "VARCHAR(32) NOT NULL DEFAULT 'saved'",
    applied_at: "DATETIME NULL",
    last_seen_at: "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP",
    created_at: "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP",
    updated_at: "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
  };

  for (const [column, definition] of Object.entries(definitions)) {
    await ensureColumn(
      connection,
      database,
      "external_applications",
      column,
      definition
    );
  }

  /*
    MODIFY the columns as well as creating missing ones.
    This repairs databases created by any earlier HireHub patch without
    deleting existing saved/applied records.
  */
  await connection.query(`
    ALTER TABLE external_applications
      MODIFY external_id TEXT NULL,
      MODIFY job_title VARCHAR(255) NOT NULL,
      MODIFY company_name VARCHAR(255) NOT NULL DEFAULT '',
      MODIFY location VARCHAR(255) NOT NULL DEFAULT '',
      MODIFY source VARCHAR(80) NOT NULL DEFAULT 'external',
      MODIFY source_label VARCHAR(160) NOT NULL DEFAULT 'External',
      MODIFY status VARCHAR(32) NOT NULL DEFAULT 'saved'
  `);

  await connection.query(`
    UPDATE external_applications
       SET status = 'saved'
     WHERE status IS NULL
        OR TRIM(status) = ''
        OR status NOT IN (
          'saved',
          'ready_to_apply',
          'applied',
          'shortlisted',
          'interview',
          'rejected',
          'selected',
          'skipped'
        )
  `);

  await ensureIndex(
    connection,
    database,
    "external_applications",
    "idx_external_applications_candidate",
    ["jobseeker_id"]
  );

  await ensureIndex(
    connection,
    database,
    "external_applications",
    "idx_external_applications_status",
    ["status"]
  );

  await ensureIndex(
    connection,
    database,
    "external_applications",
    "idx_external_applications_source",
    ["source"]
  );

  await ensureIndex(
    connection,
    database,
    "external_applications",
    "uq_external_applications_candidate_job",
    ["jobseeker_id", "external_job_key"],
    true
  );

  await ensureForeignKey(
    connection,
    database,
    {
      table: "external_applications",
      column: "jobseeker_id",
      referencedTable: "jobseekers",
      constraintName: "fk_external_applications_jobseeker",
      onDelete: "RESTRICT"
    }
  );

  /*
    Final read test: if this fails, startup stops before the frontend is
    opened, so the user never reaches a half-migrated Apply Queue.
  */
  await connection.query(`
    SELECT
      id,
      jobseeker_id,
      external_job_key,
      status
    FROM external_applications
    LIMIT 1
  `);
}

export async function ensureExternalApplicationsSchema() {
  const config = getDatabaseConfig();
  const safeDatabase = String(config.database || "").replace(
    /[^a-zA-Z0-9_]/g,
    ""
  );

  if (!safeDatabase) {
    throw new Error("Invalid DB_NAME in server/.env.");
  }

  const connection = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.username,
    password: config.password,
    database: safeDatabase
  });

  try {
    await ensureExternalApplications(
      connection,
      safeDatabase
    );
  } finally {
    await connection.end();
  }
}

async function removeLegacyUsers(
  connection,
  database
) {
  if (
    !(await tableExists(
      connection,
      database,
      "users"
    ))
  ) {
    return;
  }

  /*
    A JSON backup was created before migration.
    Supported rows have already been copied into their role tables.
    Remove any final-table FK still pointing at the old generic users table.
  */
  for (const [table, column] of [
    ["jobs", "employer_id"],
    ["jobs", "recruiter_id"],
    ["applications", "jobseeker_id"]
  ]) {
    if (
      await columnExists(
        connection,
        database,
        table,
        column
      )
    ) {
      const fks =
        await foreignKeysForColumn(
          connection,
          database,
          table,
          column
        );

      for (const fk of fks) {
        if (
          fk.referencedTableName ===
          "users"
        ) {
          const constraintName =
            String(fk.constraintName || "").trim();

          if (!constraintName) {
            continue;
          }

          try {
            await connection.query(
              `ALTER TABLE ${q(table)}
               DROP FOREIGN KEY ${q(constraintName)}`
            );
          } catch (error) {
            if (
              error?.code === "ER_CANT_DROP_FIELD_OR_KEY" ||
              Number(error?.errno) === 1091
            ) {
              continue;
            }

            throw error;
          }
        }
      }
    }
  }

  await connection.query(
    "DROP TABLE users"
  );
}

async function finalCounts(
  connection
) {
  const tables = [
    "admins",
    "recruiters",
    "jobseekers",
    "jobs",
    "applications",
    "external_applications"
  ];

  const result = {};

  for (const table of tables) {
    const [[row]] =
      await connection.query(
        `SELECT COUNT(*) AS c
           FROM ${q(table)}`
      );

    result[table] =
      countValue(row);
  }

  return result;
}

export async function ensureFinalSchema() {
  const config =
    getDatabaseConfig();

  const root =
    await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.username,
      password: config.password
    });

  const safeDatabase =
    String(
      config.database
    ).replace(
      /[^a-zA-Z0-9_]/g,
      ""
    );

  if (!safeDatabase) {
    throw new Error(
      "Invalid DB_NAME in server/.env."
    );
  }

  await root.query(
    `CREATE DATABASE IF NOT EXISTS
     ${q(safeDatabase)}
     CHARACTER SET utf8mb4
     COLLATE utf8mb4_unicode_ci`
  );

  await root.end();

  const connection =
    await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.username,
      password: config.password,
      database: safeDatabase
    });

  try {
    const backupPath =
      await backupTables(
        connection,
        safeDatabase
      );

    console.log(
      `Database safety backup: ${backupPath}`
    );

    await ensureFinalTables(
      connection,
      safeDatabase
    );

    await ensureRoleIndexes(
      connection,
      safeDatabase
    );

    const {
      recruiterIdMap,
      jobseekerIdMap
    } =
      await migrateLegacyUsers(
        connection,
        safeDatabase
      );

    await ensureDefaultAdmin(
      connection
    );

    await ensureJobs(
      connection,
      safeDatabase,
      recruiterIdMap
    );

    await ensureApplications(
      connection,
      safeDatabase,
      jobseekerIdMap
    );

    await ensureExternalApplications(
      connection,
      safeDatabase
    );

    await removeLegacyUsers(
      connection,
      safeDatabase
    );

    const counts =
      await finalCounts(
        connection
      );

    console.log("");
    console.log(
      "HireHub database ready."
    );

    console.log(
      `Admins: ${counts.admins} | Recruiters: ${counts.recruiters} | Jobseekers: ${counts.jobseekers} | Jobs: ${counts.jobs} | Applications: ${counts.applications} | External tracked: ${counts.external_applications}`
    );

    return counts;
  } finally {
    await connection.end();
  }
}
