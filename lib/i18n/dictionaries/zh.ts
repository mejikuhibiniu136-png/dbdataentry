import type { Dictionary } from '@/lib/i18n/dictionaries/en';

export const zh: Dictionary = {
  'nav.main': '主导航', 'nav.overview': '概览', 'nav.logs': '日志', 'nav.games': '游戏表', 'nav.accounts': '账号',
  'nav.analytics': '分析', 'nav.users': '用户', 'nav.sessions': '会话', 'nav.system': '系统', 'nav.logout': '退出登录',

  'header.greeting': '你好，{name}', 'header.live': '实时', 'header.connecting': '连接中…', 'header.reconnecting': '重新连接中…', 'header.paused': '已暂停',
  'header.logCount': '{count} 条日志', 'header.logsLoaded': '加载的日志数量', 'header.pause': '暂停', 'header.resume': '继续',

  'common.save': '保存', 'common.cancel': '取消', 'common.close': '关闭', 'common.delete': '删除', 'common.retry': '重试', 'common.refresh': '刷新',
  'common.loading': '加载中…', 'common.search': '搜索', 'common.clear': '清除', 'common.from': '开始', 'common.to': '结束', 'common.enabled': '已启用',
  'common.disabled': '已停用', 'common.actions': '操作', 'common.status': '状态', 'common.user': '用户', 'common.never': '从未', 'common.you': '你',
  'common.error': '出错了', 'common.confirm': '确认', 'common.loadMore': '加载更多', 'common.test': '发送测试',

  'auth.loginTitle': '登录 dbdataentry', 'auth.registerTitle': '创建账号', 'auth.loginSubtitle': '实时监控 Webhook 与账号状态。', 'auth.registerSubtitle': '新账号需经超级管理员批准后方可使用。', 'auth.registered': '账号已创建。请登录以查看审批状态。', 'auth.username': '用户名', 'auth.password': '密码', 'auth.confirmPassword': '再次输入密码', 'auth.hidePassword': '隐藏密码', 'auth.showPassword': '显示密码', 'auth.minChars': '至少 8 个字符。', 'auth.capsLock': '大写锁定已开启', 'auth.processing': '处理中…', 'auth.login': '登录', 'auth.register': '注册', 'auth.noAccount': '还没有账号？', 'auth.haveAccount': '已有账号？', 'auth.mismatch': '两次输入的密码不一致', 'auth.errorGeneric': '出错了', 'auth.errorNetwork': '发生网络错误',

  'role.superadmin': '超级管理员', 'role.admin': '版主 / 分析员', 'role.viewer': '用户 / 客户',
  'lang.label': '语言', 'lang.choose': '选择语言',

  'sessions.title': '会话与设备', 'sessions.subtitle': '当前有效的登录、来源，以及逐个结束它们的方法。',
  'sessions.mine': '我的会话', 'sessions.all': '所有用户', 'sessions.current': '此设备', 'sessions.device': '设备', 'sessions.location': '位置',
  'sessions.created': '登录时间', 'sessions.lastActive': '最近活跃', 'sessions.revoke': '撤销', 'sessions.revokeOthers': '退出其他设备',
  'sessions.revokeUser': '撤销该用户的全部会话', 'sessions.empty': '没有有效会话。', 'sessions.revokedOne': '会话已撤销',
  'sessions.revokedMany': '已撤销 {count} 个会话', 'sessions.confirmTitle': '撤销此会话？',
  'sessions.confirmBody': '该设备将被退出登录。被撤销的会话会在几秒内失效。', 'sessions.confirmAllTitle': '撤销 {name} 的所有会话？',
  'sessions.confirmOthersTitle': '退出所有其他设备？',

  'notify.title': '告警通知', 'notify.subtitle': '将安全与系统告警发送到 Discord 或 Telegram。',
  'notify.platform': '目标平台', 'notify.discord': 'Discord', 'notify.telegram': 'Telegram', 'notify.webhookUrl': 'Discord Webhook 地址', 'notify.botToken': '机器人令牌',
  'notify.chatId': '聊天 ID', 'notify.keepHint': '留空则保留已保存的值', 'notify.enabled': '发送告警', 'notify.minSeverity': '最低严重级别',
  'notify.kinds': '告警类型', 'notify.allKinds': '全部类型', 'notify.save': '保存通道', 'notify.testSent': '测试消息已发送', 'notify.testFailed': '测试消息发送失败',
  'notify.saved': '通知通道已保存', 'notify.remove': '删除通道', 'notify.history': '最近发送记录', 'notify.noHistory': '尚未发送任何消息。',
  'notify.configured': '已配置', 'notify.notConfigured': '未配置', 'notify.encryptionMissing': '未设置 ENCRYPTION_KEY，无法加密保存凭据。',
  'notify.sealedNote': '凭据在存储前经过多层加密，且不会再次显示。',
  'notify.severity.info': '信息', 'notify.severity.warning': '警告', 'notify.severity.critical': '严重',
  'notify.kind.auth.new_ip': '来自新 IP 的登录', 'notify.kind.security.spike': '安全事件激增', 'notify.kind.ingest.error_spike': '数据接入错误激增',
  'notify.kind.user.pending_approval': '账号待审批', 'notify.kind.queue.backlog': '接入队列积压', 'notify.kind.queue.dead_letter': '接入死信',
  'notify.kind.crypto.rotation': '密钥轮换问题', 'notify.kind.session.revoked': '管理员撤销会话', 'notify.kind.system.test': '测试消息',

  'queue.title': '接入队列', 'queue.subtitle': '吸收来自游戏脚本的突发流量，并异步处理。',
  'queue.mode': '队列模式', 'queue.modeHint': '开启：请求立即被接受(202)并在后台处理。关闭：直接写入(默认)。',
  'queue.depth': '等待中', 'queue.inflight': '处理中', 'queue.dead': '死信', 'queue.processed': '已处理', 'queue.retried': '已重试', 'queue.rejected': '已拒绝(已满)',
  'queue.oldest': '最早的条目', 'queue.drain': '立即处理', 'queue.retryDead': '重试死信', 'queue.purgeDead': '清空死信',

  'logs.searchPlaceholder': '搜索所有已存储的日志…', 'logs.syntax': '提示："精确短语"、-排除、event:Win、user:alice、game:slug',
  'logs.results': '匹配 {count} 条', 'logs.scanned': '已扫描 {count} 条日志', 'logs.truncated': '仅搜索了最新的 5,000 条日志。',
  'logs.exportCsv': '导出 CSV', 'logs.exportJson': '导出 JSON', 'logs.exportNdjson': '导出 NDJSON', 'logs.serverSearch': '服务器搜索', 'logs.noMatches': '没有匹配的日志。',

  'welcome.title': '欢迎，{name}', 'welcome.subtitle': '您的实时游戏账号监控仪表板已准备就绪。', 'welcome.f1': '实时监控',
  'welcome.f2': '账号管理', 'welcome.f3': '安全设计', 'welcome.enter': '进入仪表板', 'welcome.hint': '您可以从仪表板开始引导教程。',

  'tour.step': '第 {current} 步，共 {total} 步', 'tour.skip': '跳过教程', 'tour.back': '上一步', 'tour.done': '完成', 'tour.next': '下一步',
  'tour.s1.title': '欢迎使用仪表板', 'tour.s1.body': '本引导将介绍 dbdataentry 的主要区域。',
  'tour.s2.title': '浏览工作区', 'tour.s2.body': '使用侧边栏切换监控、报告和系统设置。',
  'tour.s3.title': '查看实时状态', 'tour.s3.body': '一目了然地查看连接和服务状态。',
  'tour.s4.title': '查看您的数据', 'tour.s4.body': '从仪表板浏览账号、游戏和事件表。',
  'tour.s5.title': '探索此区域', 'tour.s5.body': '主区域显示您所选部分的内容。',
  'tour.s6.title': '控制实时动态', 'tour.s6.body': '需要时可暂停或恢复实时更新。',
};
