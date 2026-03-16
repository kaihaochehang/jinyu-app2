const express = require('express');
const router = express.Router();
const { Announcement } = require('../models');
const { authenticate } = require('../middleware/auth');

// 获取公告列表（公开接口）
router.get('/', async (req, res) => {
  try {
    const announcements = await Announcement.findAll({
      where: { isActive: true },
      order: [['priority', 'DESC'], ['createdAt', 'DESC']],
      limit: 10
    });

    res.json({
      success: true,
      data: announcements
    });
  } catch (error) {
    console.error('获取公告错误:', error);
    res.status(500).json({
      success: false,
      message: '获取公告失败'
    });
  }
});

// 获取最新公告（公开接口）
router.get('/latest', async (req, res) => {
  try {
    const announcement = await Announcement.findOne({
      where: { isActive: true },
      order: [['priority', 'DESC'], ['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      data: announcement
    });
  } catch (error) {
    console.error('获取最新公告错误:', error);
    res.status(500).json({
      success: false,
      message: '获取公告失败'
    });
  }
});

// 获取公告详情（需要登录）
router.get('/:id', authenticate, async (req, res) => {
  try {
    const announcement = await Announcement.findByPk(req.params.id);
    
    if (!announcement) {
      return res.status(404).json({
        success: false,
        message: '公告不存在'
      });
    }

    res.json({
      success: true,
      data: announcement
    });
  } catch (error) {
    console.error('获取公告详情错误:', error);
    res.status(500).json({
      success: false,
      message: '获取公告详情失败'
    });
  }
});

module.exports = router;
