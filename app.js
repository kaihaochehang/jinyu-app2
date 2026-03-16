// 全局状态
let currentUser = null;

// 登录按钮点击处理（供HTML内联调用）
function handleLoginClick() {
    console.log('handleLoginClick 被调用');
    const userId = document.getElementById('loginUserId').value.trim();
    const password = document.getElementById('loginPassword').value.trim();
    
    console.log('输入值:', { userId, hasPassword: !!password });
    
    if (!userId || !password) {
        alert('请填写完整信息');  // 使用 alert 确保能看到提示
        return;
    }
    
    // 这里可以继续调用原来的登录逻辑
    login(userId, password);
}

// 登录函数
async function login(userId, password) {
    const btn = document.getElementById('btnLogin');
    btn.textContent = '登录中...';
    btn.disabled = true;
    
    try {
        const response = await api.auth.login(userId, password);
        if (response.success) {
            currentUser = response.data.user;
            saveUserToLocalStorage(currentUser);
            showMemberCenter();
            updateUserInfo();
            alert('登录成功');
            checkRelease();
        }
    } catch (error) {
        console.error('登录错误:', error);
        alert(error.message || '登录失败，请检查网络连接');
    } finally {
        btn.textContent = '登 录';
        btn.disabled = false;
    }
}

// 存储用户信息到本地
function saveUserToLocalStorage(user) {
    localStorage.setItem('userInfo', JSON.stringify(user));
}

// 从本地加载用户信息
function loadUserFromLocalStorage() {
    const userStr = localStorage.getItem('userInfo');
    return userStr ? JSON.parse(userStr) : null;
}

// 清除本地用户信息
function clearUserFromLocalStorage() {
    localStorage.removeItem('userInfo');
}

// DOM 元素
const authContainer = document.getElementById('authContainer');
const memberContainer = document.getElementById('memberContainer');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');

// 检查是否已登录
function isLoggedIn() {
    return !!localStorage.getItem('authToken');
}

// 退出登录
function logout() {
    localStorage.removeItem('authToken');
    clearUserFromLocalStorage();
}

// 初始化
async function init() {
    if (isLoggedIn()) {
        try {
            // 先从本地加载用户信息
            const localUser = loadUserFromLocalStorage();
            if (localUser) {
                currentUser = localUser;
                showMemberCenter();
                updateUserInfo();
                checkRelease();
            }
            
            // 然后从服务器获取最新信息
            const response = await api.user.getProfile();
            if (response.success) {
                currentUser = response.data.user;
                saveUserToLocalStorage(currentUser);
                updateUserInfo();
                checkRelease();
            } else {
                logout();
                showAuthPage();
            }
        } catch (error) {
            console.error('获取用户信息失败:', error);
            // 如果API调用失败，但本地有缓存，继续使用本地数据
            if (!currentUser) {
                logout();
                showAuthPage();
            }
        }
    } else {
        showAuthPage();
    }
    
    // 加载公告
    loadAnnouncements();
    
    // 绑定事件
    bindEvents();
}

// 显示认证页面
function showAuthPage() {
    authContainer.style.display = 'flex';
    memberContainer.style.display = 'none';
}

// 显示会员中心
function showMemberCenter() {
    authContainer.style.display = 'none';
    memberContainer.style.display = 'block';
}

// 更新用户信息
function updateUserInfo() {
    if (!currentUser) return;
    
    document.getElementById('yellowFishCount').textContent = formatNumber(currentUser.yellowFish);
    document.getElementById('lockedBaitCount').textContent = formatNumber(currentUser.lockedBait);
}

// 格式化数字
function formatNumber(num) {
    return parseFloat(num).toLocaleString('zh-CN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

// 显示提示
function showToast(message, duration = 3000) {
    const toast = document.getElementById('toastMessage');
    toast.textContent = message;
    toast.classList.add('active');
    
    setTimeout(() => {
        toast.classList.remove('active');
    }, duration);
}

// 加载公告
async function loadAnnouncements() {
    try {
        const response = await api.announcement.getLatest();
        if (response.success && response.data) {
            const announcement = response.data;
            document.getElementById('announcementContent').textContent = 
                `${announcement.title} - ${announcement.content}`;
        }
    } catch (error) {
        console.error('加载公告失败:', error);
    }
}

// 检查释放
async function checkRelease() {
    if (!currentUser) return;
    
    const today = new Date().toISOString().split('T')[0];
    
    // 如果今天未领取且有可领取金额
    if (currentUser.lastReleaseDate !== today) {
        const releaseAmount = parseFloat((currentUser.lockedBait * 0.002).toFixed(2));
        const accelerateAmount = currentUser.pendingAccelerateAmount || 0;
        
        if (releaseAmount > 0 || accelerateAmount > 0) {
            showReleasePopup(releaseAmount + accelerateAmount);
        }
    }
}

// 显示释放弹窗
function showReleasePopup(amount) {
    const popup = document.getElementById('releasePopup');
    const content = popup.querySelector('.popup-content');
    const amountEl = document.getElementById('releaseAmount');
    const placeholderEl = document.getElementById('releaseAmountPlaceholder');
    
    amountEl.textContent = formatNumber(amount);
    placeholderEl.style.display = 'none';
    amountEl.style.display = 'block';
    popup.classList.add('active');
    
    // 点击弹窗内容区域 - 领取红包
    content.onclick = async (e) => {
        e.stopPropagation(); // 阻止冒泡到popup
        try {
            const response = await api.transaction.release();
            if (response.success) {
                showToast(`领取成功！获得 ${formatNumber(response.data.releaseAmount + response.data.accelerateAmount)} 红包`);
                currentUser.yellowFish = response.data.yellowFish;
                currentUser.lockedBait = response.data.lockedBait;
                currentUser.lastReleaseDate = new Date().toISOString().split('T')[0];
                updateUserInfo();
            }
        } catch (error) {
            showToast(error.message || '领取失败');
        }
        // 恢复占位符状态
        placeholderEl.style.display = 'block';
        amountEl.style.display = 'none';
        popup.classList.remove('active');
    };
    
    // 点击弹窗外部区域 - 取消
    popup.onclick = () => {
        // 恢复占位符状态
        placeholderEl.style.display = 'block';
        amountEl.style.display = 'none';
        popup.classList.remove('active');
    };
}

// 绑定事件
function bindEvents() {
    // 登录/注册切换
    document.getElementById('toRegister').onclick = (e) => {
        e.preventDefault();
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
    };
    
    document.getElementById('toLogin').onclick = (e) => {
        e.preventDefault();
        registerForm.style.display = 'none';
        loginForm.style.display = 'block';
    };
    
    // 登录
    document.getElementById('btnLogin').onclick = async () => {
        const userId = document.getElementById('loginUserId').value;
        const password = document.getElementById('loginPassword').value;
        
        console.log('登录按钮被点击', { userId, password: '***' });
        
        if (!userId || !password) {
            showToast('请填写完整信息');
            return;
        }
        
        // 显示加载状态
        const btn = document.getElementById('btnLogin');
        const originalText = btn.textContent;
        btn.textContent = '登录中...';
        btn.disabled = true;
        
        try {
            console.log('开始调用登录API');
            const response = await api.auth.login(userId, password);
            console.log('登录响应:', response);
            
            if (response.success) {
                currentUser = response.data.user;
                saveUserToLocalStorage(currentUser);
                showMemberCenter();
                updateUserInfo();
                showToast('登录成功');
                checkRelease();
            }
        } catch (error) {
            console.error('登录错误:', error);
            showToast(error.message || '登录失败，请检查网络连接');
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    };
    
    // 注册
    document.getElementById('btnRegister').onclick = async () => {
        const userId = document.getElementById('regUserId').value;
        const password = document.getElementById('regPassword').value;
        const tradePassword = document.getElementById('regTradePassword').value;
        const inviteCode = document.getElementById('regInviteCode').value;
        
        if (!userId || !password || !tradePassword) {
            showToast('请填写完整信息');
            return;
        }
        
        if (password.length < 6 || tradePassword.length < 6) {
            showToast('密码至少6位');
            return;
        }
        
        try {
            const response = await api.auth.register(userId, password, tradePassword, inviteCode);
            if (response.success) {
                currentUser = response.data.user;
                saveUserToLocalStorage(currentUser);
                showMemberCenter();
                updateUserInfo();
                showToast('注册成功');
            }
        } catch (error) {
            showToast(error.message || '注册失败');
        }
    };
    
    // 退出登录
    document.getElementById('btnLogout').onclick = () => {
        logout();
        currentUser = null;
        clearUserFromLocalStorage();
        showAuthPage();
        showToast('已退出登录');
    };
    
    // 转账
    bindModalEvents('transfer', async () => {
        const toUserId = document.getElementById('transferToId').value;
        const amount = parseFloat(document.getElementById('transferAmount').value);
        const tradePassword = document.getElementById('transferTradePassword').value;
        
        if (!toUserId || !amount || !tradePassword) {
            showToast('请填写完整信息');
            return;
        }
        
        if (amount % 100 !== 0) {
            showToast('转账金额必须是100的整数倍');
            return;
        }
        
        try {
            const response = await api.transaction.transfer(toUserId, amount, tradePassword);
            if (response.success) {
                currentUser.yellowFish = response.data.yellowFish;
                currentUser.lockedBait = response.data.lockedBait;
                updateUserInfo();
                showToast('转账成功');
                closeModal('transfer');
            }
        } catch (error) {
            showToast(error.message || '转账失败');
        }
    });
    
    // 兑换
    bindModalEvents('exchange', async () => {
        const amount = parseFloat(document.getElementById('exchangeAmount').value);
        
        if (!amount) {
            showToast('请输入兑换金额');
            return;
        }
        
        try {
            const response = await api.transaction.exchange(amount);
            if (response.success) {
                currentUser.yellowFish = response.data.yellowFish;
                currentUser.lockedBait = response.data.lockedBait;
                updateUserInfo();
                showToast('兑换成功');
                closeModal('exchange');
            }
        } catch (error) {
            showToast(error.message || '兑换失败');
        }
    });
    
    // 实时计算兑换结果
    document.getElementById('exchangeAmount').oninput = (e) => {
        const amount = parseFloat(e.target.value) || 0;
        document.getElementById('exchangeResult').textContent = formatNumber(amount * 5);
    };
    
    // 记录
    bindModalEvents('records', null, async () => {
        try {
            const response = await api.transaction.getRecords();
            if (response.success) {
                renderRecords(response.data.transactions);
            }
        } catch (error) {
            showToast('加载记录失败');
        }
    });
    
    // 团队
    bindModalEvents('team', null, async () => {
        try {
            const response = await api.user.getTeam();
            if (response.success) {
                document.getElementById('teamCount').textContent = response.data.count;
                document.getElementById('myInviteCode').textContent = currentUser.inviteCode;
                renderTeamList(response.data.referrals);
            }
        } catch (error) {
            showToast('加载团队信息失败');
        }
    });
    
    // 复制邀请码
    document.getElementById('copyInviteCode').onclick = () => {
        navigator.clipboard.writeText(currentUser.inviteCode).then(() => {
            showToast('邀请码已复制');
        });
    };
    
    // 帮助
    bindModalEvents('help');
    
    // 个人中心
    bindModalEvents('profile', null, () => {
        document.getElementById('profileUserId').textContent = currentUser.userId;
        document.getElementById('profileYellowFish').textContent = formatNumber(currentUser.yellowFish);
        document.getElementById('profileLockedBait').textContent = formatNumber(currentUser.lockedBait);
        document.getElementById('profilePendingAccelerate').textContent = formatNumber(currentUser.pendingAccelerateAmount || 0);
    });
    
    // 修改密码
    bindModalEvents('changePassword', async () => {
        const currentLoginPwd = document.getElementById('currentLoginPwd').value;
        const newLoginPwd = document.getElementById('newLoginPwd').value;
        const currentTradePwd = document.getElementById('currentTradePwd').value;
        const newTradePwd = document.getElementById('newTradePwd').value;
        
        if ((!currentLoginPwd || !newLoginPwd) && (!currentTradePwd || !newTradePwd)) {
            showToast('请至少修改一种密码');
            return;
        }
        
        try {
            const response = await api.user.changePassword(
                currentLoginPwd, newLoginPwd, currentTradePwd, newTradePwd
            );
            if (response.success) {
                showToast('密码修改成功，请重新登录');
                closeModal('changePassword');
                logout();
                currentUser = null;
                showAuthPage();
            }
        } catch (error) {
            showToast(error.message || '修改密码失败');
        }
    });
    
    // 公告
    bindModalEvents('announcement', null, async () => {
        try {
            const response = await api.announcement.getList();
            if (response.success) {
                renderAnnouncements(response.data);
            }
        } catch (error) {
            showToast('加载公告失败');
        }
    });
}

// 绑定弹窗事件
function bindModalEvents(name, confirmCallback = null, openCallback = null) {
    const btn = document.getElementById(`btn${name.charAt(0).toUpperCase() + name.slice(1)}`);
    const modal = document.getElementById(`${name}Modal`);
    const closeBtn = document.getElementById(`close${name.charAt(0).toUpperCase() + name.slice(1)}Modal`);
    const cancelBtn = document.getElementById(`cancel${name.charAt(0).toUpperCase() + name.slice(1)}`);
    const confirmBtn = document.getElementById(`confirm${name.charAt(0).toUpperCase() + name.slice(1)}`);
    const closeBtn2 = document.getElementById(`close${name.charAt(0).toUpperCase() + name.slice(1)}Btn`);
    
    if (btn) {
        btn.onclick = () => {
            openModal(name);
            if (openCallback) openCallback();
        };
    }
    
    if (closeBtn) {
        closeBtn.onclick = () => closeModal(name);
    }
    
    if (cancelBtn) {
        cancelBtn.onclick = () => closeModal(name);
    }
    
    if (confirmBtn && confirmCallback) {
        confirmBtn.onclick = confirmCallback;
    }
    
    if (closeBtn2) {
        closeBtn2.onclick = () => closeModal(name);
    }
    
    // 点击外部关闭
    modal.onclick = (e) => {
        if (e.target === modal) {
            closeModal(name);
        }
    };
}

// 打开弹窗
function openModal(name) {
    document.getElementById(`${name}Modal`).classList.add('active');
}

// 关闭弹窗
function closeModal(name) {
    document.getElementById(`${name}Modal`).classList.remove('active');
    
    // 清空表单
    const modal = document.getElementById(`${name}Modal`);
    const inputs = modal.querySelectorAll('input');
    inputs.forEach(input => input.value = '');
}

// 渲染交易记录
function renderRecords(transactions) {
    const tbody = document.getElementById('recordsList');
    tbody.innerHTML = '';
    
    if (!transactions || transactions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">暂无记录</td></tr>';
        return;
    }
    
    const typeMap = {
        'register': '注册奖励',
        'release': '积分释放',
        'accelerate': '加速分红',
        'transfer_out': '转账支出',
        'transfer_in': '转账收入',
        'exchange': '兑换积分'
    };
    
    transactions.forEach(record => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${new Date(record.createdAt).toLocaleString()}</td>
            <td>${typeMap[record.type] || record.type}</td>
            <td>${record.yellowFish > 0 ? '+' : ''}${formatNumber(record.yellowFish)}</td>
            <td>${record.lockedBait > 0 ? '+' : ''}${formatNumber(record.lockedBait)}</td>
            <td>${record.remark || '-'}</td>
        `;
        tbody.appendChild(tr);
    });
}

// 渲染团队列表
function renderTeamList(referrals) {
    const container = document.getElementById('teamList');
    container.innerHTML = '';
    
    if (!referrals || referrals.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">暂无团队成员</div>';
        return;
    }
    
    referrals.forEach(member => {
        const div = document.createElement('div');
        div.className = 'team-member';
        div.innerHTML = `
            <span>${member.userId}</span>
            <span>红包: ${formatNumber(member.yellowFish)}</span>
        `;
        container.appendChild(div);
    });
}

// 渲染公告
function renderAnnouncements(announcements) {
    const container = document.getElementById('announcementList');
    container.innerHTML = '';
    
    if (!announcements || announcements.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 20px;">暂无公告</div>';
        return;
    }
    
    announcements.forEach(announcement => {
        const div = document.createElement('div');
        div.style.cssText = 'padding: 16px; border-bottom: 1px solid #e2e8f0; cursor: pointer;';
        div.innerHTML = `
            <h4 style="margin-bottom: 8px; color: #2d3748;">${announcement.title}</h4>
            <p style="color: #718096; font-size: 14px;">${announcement.content}</p>
            <div style="margin-top: 8px; font-size: 12px; color: #a0aec0;">
                ${announcement.platform} · ${new Date(announcement.publishTime).toLocaleDateString()}
            </div>
        `;
        container.appendChild(div);
    });
}

// 启动应用
document.addEventListener('DOMContentLoaded', init);
