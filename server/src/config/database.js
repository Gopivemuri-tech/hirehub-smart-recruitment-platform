import { Sequelize } from "sequelize";

export function getDatabaseConfig() {
  return {
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    database: process.env.DB_NAME || "hirehub",
    username: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || ""
  };
}

const config = getDatabaseConfig();

export const sequelize = new Sequelize(
  config.database,
  config.username,
  config.password,
  {
    host: config.host,
    port: config.port,
    dialect: "mysql",
    logging: false,
    define: {
      underscored: true,
      freezeTableName: true
    },
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  }
);

export async function authenticateDatabase() {
  await sequelize.authenticate();
  console.log(`MySQL connected: ${config.database}`);
}
