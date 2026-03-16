const { Sequelize } = require('sequelize');

// 从环境变量获取数据库配置
const DB_URL = process.env.DATABASE_URL;

const sequelize = new Sequelize(DB_URL, {
  dialect: 'postgres',
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000
  }
});

const db = {};

db.Sequelize = Sequelize;
db.sequelize = sequelize;

// 导入模型
db.User = require('./user')(sequelize, Sequelize);
db.Transaction = require('./transaction')(sequelize, Sequelize);
db.Announcement = require('./announcement')(sequelize, Sequelize);

// 定义关联关系
// 用户与交易记录
db.User.hasMany(db.Transaction, { foreignKey: 'userId', as: 'transactions' });
db.Transaction.belongsTo(db.User, { foreignKey: 'userId', as: 'user' });

// 用户与推荐人
db.User.belongsTo(db.User, { foreignKey: 'referrerId', as: 'referrer' });
db.User.hasMany(db.User, { foreignKey: 'referrerId', as: 'referrals' });

module.exports = db;
