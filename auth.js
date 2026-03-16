const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { User } = require('../models');
const { generateToken } = require('../middleware/auth');
const { 
  generateInviteCode, 
  hashPassword, 
  verifyPassword,
  createTransactionRecord 
} = require('../utils/helpers');

// 注册
router.post('/register', [
  body('userId').isLength({ min: 11, max: 11 }).withMessage('手机号格式不正确'),
  body('password').isLength({ min: 6 }).withMessage('密码至少6位'),
  body('tradePassword').isLength({ min: 6 }).withMessage('交易密码至少6位'),
  body('inviteCode').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: errors.array()[0].msg
      });
    }

    const { userId, password, tradePassword, inviteCode } = req.body;

    // 检查用户是否已存在
    const existingUser = await User.findOne({ where: { userId } });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: '该手机号已注册'
      });
    }

    // 查找推荐人
    let referrerId = null;
    if (inviteCode) {
      const referrer = await User.findOne({ where: { inviteCode } });
      if (referrer) {
        referrerId = referrer.id;
      }
    }

    // 加密密码
    const hashedPassword = await hashPassword(password);
    const hashedTradePassword = await hashPassword(tradePassword);

    // 创建用户
    const newUser = await User.create({
      userId,
      password: hashedPassword,
      tradePassword: hashedTradePassword,
      yellowFish: parseFloat(process.env.NEW_USER_YELLOW_FISH ?? 0),
      lockedBait: parseFloat(process.env.NEW_USER_LOCKED_BAIT ?? 500),
      inviteCode: generateInviteCode(),
      referrerId,
      pendingAccelerateAmount: 0
    });

    // 创建注册奖励记录
    await createTransactionRecord(
      newUser.id,
      'register',
      parseFloat(process.env.NEW_USER_YELLOW_FISH ?? 0),
      parseFloat(process.env.NEW_USER_LOCKED_BAIT ?? 500),
      '新用户注册奖励'
    );

    // 生成令牌
    const token = generateToken(newUser.id);

    res.status(201).json({
      success: true,
      message: '注册成功',
      data: {
        token,
        user: {
          id: newUser.id,
          userId: newUser.userId,
          yellowFish: newUser.yellowFish,
          lockedBait: newUser.lockedBait,
          inviteCode: newUser.inviteCode,
          pendingAccelerateAmount: newUser.pendingAccelerateAmount
        }
      }
    });
  } catch (error) {
    console.error('注册错误:', error);
    res.status(500).json({
      success: false,
      message: '注册失败，请稍后重试'
    });
  }
});

// 登录
router.post('/login', [
  body('userId').notEmpty().withMessage('请输入手机号'),
  body('password').notEmpty().withMessage('请输入密码')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: errors.array()[0].msg
      });
    }

    const { userId, password } = req.body;

    // 查找用户
    const user = await User.findOne({ where: { userId } });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: '账号或密码错误'
      });
    }

    // 验证密码
    const isValidPassword = await verifyPassword(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: '账号或密码错误'
      });
    }

    if (user.status === 'banned') {
      return res.status(403).json({
        success: false,
        message: '账户已被禁用'
      });
    }

    // 生成令牌
    const token = generateToken(user.id);

    res.json({
      success: true,
      message: '登录成功',
      data: {
        token,
        user: {
          id: user.id,
          userId: user.userId,
          yellowFish: user.yellowFish,
          lockedBait: user.lockedBait,
          inviteCode: user.inviteCode,
          pendingAccelerateAmount: user.pendingAccelerateAmount,
          lastReleaseDate: user.lastReleaseDate
        }
      }
    });
  } catch (error) {
    console.error('登录错误:', error);
    res.status(500).json({
      success: false,
      message: '登录失败，请稍后重试'
    });
  }
});

module.exports = router;
