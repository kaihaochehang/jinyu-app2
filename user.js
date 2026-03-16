const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { User, Transaction } = require('../models');
const { authenticate } = require('../middleware/auth');
const { hashPassword, verifyPassword } = require('../utils/helpers');

// 获取用户信息
router.get('/profile', authenticate, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: { exclude: ['password', 'tradePassword'] },
      include: [{
        model: User,
        as: 'referrer',
        attributes: ['userId', 'inviteCode']
      }]
    });

    // 获取交易记录
    const transactions = await Transaction.findAll({
      where: { userId: req.user.id },
      order: [['createdAt', 'DESC']],
      limit: 50
    });

    res.json({
      success: true,
      data: {
        user,
        transactions
      }
    });
  } catch (error) {
    console.error('获取用户信息错误:', error);
    res.status(500).json({
      success: false,
      message: '获取用户信息失败'
    });
  }
});

// 修改密码
router.put('/password', authenticate, [
  body('currentPassword').notEmpty().withMessage('请输入当前密码'),
  body('newPassword').isLength({ min: 6 }).withMessage('新密码至少6位')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: errors.array()[0].msg
      });
    }

    const { currentPassword, newPassword, currentTradePassword, newTradePassword } = req.body;

    const user = await User.findByPk(req.user.id);

    // 修改登录密码
    if (currentPassword && newPassword) {
      const isValidPassword = await verifyPassword(currentPassword, user.password);
      if (!isValidPassword) {
        return res.status(400).json({
          success: false,
          message: '当前登录密码错误'
        });
      }

      user.password = await hashPassword(newPassword);
    }

    // 修改交易密码
    if (currentTradePassword && newTradePassword) {
      const isValidTradePassword = await verifyPassword(currentTradePassword, user.tradePassword);
      if (!isValidTradePassword) {
        return res.status(400).json({
          success: false,
          message: '当前交易密码错误'
        });
      }

      user.tradePassword = await hashPassword(newTradePassword);
    }

    await user.save();

    res.json({
      success: true,
      message: '密码修改成功'
    });
  } catch (error) {
    console.error('修改密码错误:', error);
    res.status(500).json({
      success: false,
      message: '修改密码失败'
    });
  }
});

// 获取团队信息
router.get('/team', authenticate, async (req, res) => {
  try {
    const referrals = await User.findAll({
      where: { referrerId: req.user.id },
      attributes: ['userId', 'yellowFish', 'lockedBait', 'createdAt']
    });

    res.json({
      success: true,
      data: {
        referrals,
        count: referrals.length
      }
    });
  } catch (error) {
    console.error('获取团队信息错误:', error);
    res.status(500).json({
      success: false,
      message: '获取团队信息失败'
    });
  }
});

module.exports = router;
