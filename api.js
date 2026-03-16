// API 基础配置
const API_BASE_URL = window.location.origin + '/api';

// 存储令牌
let authToken = localStorage.getItem('authToken') || null;

// 设置令牌
function setAuthToken(token) {
    authToken = token;
    localStorage.setItem('authToken', token);
}

// 清除令牌
function clearAuthToken() {
    authToken = null;
    localStorage.removeItem('authToken');
}

// 获取请求头
function getHeaders() {
    const headers = {
        'Content-Type': 'application/json'
    };
    
    if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
    }
    
    return headers;
}

// 通用请求函数
async function request(url, options = {}) {
    try {
        console.log('API请求开始:', `${API_BASE_URL}${url}`, options);
        const response = await fetch(`${API_BASE_URL}${url}`, {
            ...options,
            headers: {
                ...getHeaders(),
                ...options.headers
            }
        });
        
        console.log('API响应状态:', response.status);
        const data = await response.json();
        console.log('API响应数据:', data);
        
        if (!response.ok) {
            throw new Error(data.message || '请求失败');
        }
        
        return data;
    } catch (error) {
        console.error('API请求错误:', error);
        console.error('错误堆栈:', error.stack);
        // 将常见英文错误转换为中文
        let errorMessage = error.message;
        if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
            errorMessage = '网络连接失败，请检查服务器是否启动';
        } else if (errorMessage.includes('ECONNREFUSED')) {
            errorMessage = '无法连接到服务器';
        } else if (errorMessage.includes('timeout')) {
            errorMessage = '请求超时，请稍后重试';
        }
        throw new Error(errorMessage);
    }
}

// API 方法
const api = {
    // 认证
    auth: {
        // 登录
        login: async (userId, password) => {
            const data = await request('/auth/login', {
                method: 'POST',
                body: JSON.stringify({ userId, password })
            });
            
            if (data.success && data.data.token) {
                setAuthToken(data.data.token);
            }
            
            return data;
        },
        
        // 注册
        register: async (userId, password, tradePassword, inviteCode = '') => {
            const data = await request('/auth/register', {
                method: 'POST',
                body: JSON.stringify({ userId, password, tradePassword, inviteCode })
            });
            
            if (data.success && data.data.token) {
                setAuthToken(data.data.token);
            }
            
            return data;
        }
    },
    
    // 用户
    user: {
        // 获取用户信息
        getProfile: async () => {
            return await request('/user/profile');
        },
        
        // 修改密码
        changePassword: async (currentPassword, newPassword, currentTradePassword, newTradePassword) => {
            return await request('/user/password', {
                method: 'PUT',
                body: JSON.stringify({ 
                    currentPassword, 
                    newPassword, 
                    currentTradePassword, 
                    newTradePassword 
                })
            });
        },
        
        // 获取团队信息
        getTeam: async () => {
            return await request('/user/team');
        }
    },
    
    // 交易
    transaction: {
        // 转账
        transfer: async (toUserId, amount, tradePassword) => {
            return await request('/transaction/transfer', {
                method: 'POST',
                body: JSON.stringify({ toUserId, amount, tradePassword })
            });
        },
        
        // 兑换
        exchange: async (amount) => {
            return await request('/transaction/exchange', {
                method: 'POST',
                body: JSON.stringify({ amount })
            });
        },
        
        // 领取释放
        release: async () => {
            return await request('/transaction/release', {
                method: 'POST'
            });
        },
        
        // 获取交易记录
        getRecords: async (page = 1, limit = 20) => {
            return await request(`/transaction/records?page=${page}&limit=${limit}`);
        }
    },
    
    // 公告
    announcement: {
        // 获取公告列表
        getList: async () => {
            return await request('/announcement');
        },
        
        // 获取最新公告
        getLatest: async () => {
            return await request('/announcement/latest');
        },
        
        // 获取公告详情
        getDetail: async (id) => {
            return await request(`/announcement/${id}`);
        }
    }
};

// 检查是否已登录
function isLoggedIn() {
    return !!authToken;
}

// 退出登录
function logout() {
    clearAuthToken();
}
