module.exports = {
  apps: [{
    name: 'chatbot-ia',
    script: 'server.js',
    cwd: __dirname,
    watch: false,
    max_memory_restart: '500M',
    restart_delay: 5000,
    max_restarts: 20,
    autorestart: true,
    env: {
      NODE_ENV: 'production'
    },
    // Logs
    error_file: './logs/error.log',
    out_file: './logs/output.log',
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    // Graceful shutdown
    kill_timeout: 5000,
    listen_timeout: 10000
  }]
};
