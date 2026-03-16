const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { User, Transaction } = require('../models');
const { authenticate } = require('../middleware/auth');
const { 
  verifyPassword, 
  createTransactionRecord,
  calculateReleaseAmount,
  calculateTransferReward,
  calculateAccelerateAmount
} = require('../utils/helpers');
const { Op } = require('sequelize');

// 转账
router.post('/transfer', authenticate, [
  body('toUserId').notEmpty().withMessage('请输入接收方账号'),
  body('amount').isFloat({ min: 100 }).withMessage('转账金额至少100'),
  body('tradePassword').notEmpty().withMessage('请输入交易密码')
], async (req, res) => {
  const transaction = await require('../models').sequelize.transaction();
  
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: errors.array()[0].msg
      });
    }

    const { toUserId, amount, tradePassword } = req.body;
    const transferAmount = parseFloat(amount);

    // 验证交易密码
    const user = await User.findByPk(req.user.id, { transaction });
    const isValidTradePassword = await verifyPassword(tradePassword, user.tradePassword);
    if (!isValidTradePassword) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: '交易密码错误'
      });
    }

    // 检查余额
    if (user.yellowFish < transferAmount) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: '红包余额不足'
      });
    }

    // 查找接收方
    const receiver = await User.findOne({ 
      where: { userId: toUserId },
      transaction 
    });
    if (!receiver) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: '接收方不存在'
      });
    }

    // 计算转账奖励
    const baitReward = parseFloat((transferAmount * 0.5).toFixed(2));
    const receiverYellowFish = parseFloat((transferAmount * 0.9).toFixed(2));
    const receiverBait = parseFloat((transferAmount * 0.1).toFixed(2));

    // 转出方扣款
    user.yellowFish = parseFloat((parseFloat(user.yellowFish) - transferAmount).toFixed(2));
    user.lockedBait = parseFloat((parseFloat(user.lockedBait) + baitReward).toFixed(2));
    await user.save({ transaction });

    // 接收方到账
    receiver.yellowFish = parseFloat((parseFloat(receiver.yellowFish) + receiverYellowFish).toFixed(2));
    receiver.lockedBait = parseFloat((parseFloat(receiver.lockedBait) + receiverBait).toFixed(2));
    await receiver.save({ transaction });

    // 创建交易记录
    await createTransactionRecord(
      user.id,
      'transfer_out',
      -transferAmount,
      baitReward,
      `转账给 ${toUserId}`,
      receiver.id
    );

    await createTransactionRecord(
      receiver.id,
      'transfer_in',
      receiverYellowFish,
      receiverBait,
      `来自 ${user.userId} 的转账`,
      user.id
    );

    await transaction.commit();

    res.json({
      success: true,
      message: '转账成功',
      data: {
        yellowFish: user.yellowFish,
        lockedBait: user.lockedBait
      }
    });
  } catch (error) {
    await transaction.rollback();
    console.error('转账错误:', error);
    res.status(500).json({
      success: false,
      message: '转账失败'
    });
  }
});

// 兑换
router.post('/exchange', authenticate, [
  body('amount').isFloat({ min: 100 }).withMessage('兑换金额至少100')
], async (req, res) => {
  const transaction = await require('../models').sequelize.transaction();
  
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: errors.array()[0].msg
      });
    }

    const { amount } = req.body;
    const exchangeAmount = parseFloat(amount);

    // 获取用户信息
    const user = await User.findByPk(req.user.id, { transaction });

    // 检查余额
    if (user.yellowFish < exchangeAmount) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: '红包余额不足'
      });
    }

    // 计算兑换积分
    const exchangeRate = parseFloat(process.env.EXCHANGE_RATE) || 5;
    const baitAmount = parseFloat((exchangeAmount * exchangeRate).toFixed(2));

    // 扣除红包，增加积分
    user.yellowFish = parseFloat((parseFloat(user.yellowFish) - exchangeAmount).toFixed(2));
    user.lockedBait = parseFloat((parseFloat(user.lockedBait) + baitAmount).toFixed(2));
    await user.save({ transaction });

    // 创建交易记录
    await createTransactionRecord(
      user.id,
      'exchange',
      -exchangeAmount,
      baitAmount,
      '红包兑换积分'
    );

    // 为上级触发加速释放
    if (user.referrerId) {
      const referrer = await User.findByPk(user.referrerId, { transaction });
      if (referrer) {
        const accelerateAmount = calculateAccelerateAmount(exchangeAmount);
        referrer.pendingAccelerateAmount = parseFloat(
          (parseFloat(referrer.pendingAccelerateAmount || 0) + accelerateAmount).toFixed(2)
        );
        await referrer.save({ transaction });
      }
    }

    await transaction.commit();

    res.json({
      success: true,
      message: '兑换成功',
      data: {
        yellowFish: user.yellowFish,
        lockedBait: user.lockedBait
      }
    });
  } catch (error) {
    await transaction.rollback();
    console.error('兑换错误:', error);
    res.status(500).json({
      success: false,
      message: '兑换失败'
    });
  }
});

// 领取释放（积分释放 + 加速释放）
router.post('/release', authenticate, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id);
    const today = new Date().toISOString().split('T')[0];

    // 检查今天是否已领取
    if (user.lastReleaseDate === today) {
      return res.status(400).json({
        success: false,
        message: '今天已领取过'
      });
    }

    const releaseAmount = calculateReleaseAmount(user.lockedBait);
    const accelerateAmount = parseFloat(user.pendingAccelerateAmount || 0);

    if (releaseAmount <= 0 && accelerateAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: '没有可领取的金额'
      });
    }

    // 积分释放
    if (releaseAmount > 0) {
      user.yellowFish = parseFloat((parseFloat(user.yellowFish) + releaseAmount).toFixed(2));
      user.lockedBait = parseFloat((parseFloat(user.lockedBait) - releaseAmount).toFixed(2));
      
      await createTransactionRecord(
        user.id,
        'release',
        releaseAmount,
        -releaseAmount,
        '每日积分释放'
      );
    }

    // 加速释放
    if (accelerateAmount > 0) {
      user.yellowFish = parseFloat((parseFloat(user.yellowFish) + parseFloat(accelerateAmount)).toFixed(2));
      user.pendingAccelerateAmount = 0;
      
      await createTransactionRecord(
        user.id,
        'accelerate',
        accelerateAmount,
        0,
        '下级兑换积分加速分红'
      );
    }

    user.lastReleaseDate = today;
    await user.save();

    res.json({
      success: true,
      message: '领取成功',
      data: {
        releaseAmount,
        accelerateAmount,
        yellowFish: user.yellowFish,
        lockedBait: user.lockedBait
      }
    });
  } catch (error) {
    console.error('领取释放错误:', error);
    res.status(500).json({
      success: false,
      message: '领取失败'
    });
  }
});

// 获取交易记录
router.get('/records', authenticate, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const { count, rows: transactions } = await Transaction.findAndCountAll({
      where: { userId: req.user.id },
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      data: {
        transactions,
        pagination: {
          total: count,
          page: parseInt(page),
          totalPages: Math.ceil(count / limit)
        }
      }
    });
  } catch (error) {
    console.error('获取交易记录错误:', error);
    res.status(500).json({
      success: false,
      message: '获取交易记录失败'
    });
  }
});

module.exports = router;
