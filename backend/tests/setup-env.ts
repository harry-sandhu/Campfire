process.env.NODE_ENV = "test";
process.env.MONGODB_URI ??= "mongodb://127.0.0.1:27017/unused";
process.env.JWT_ACCESS_SECRET = "test-access-secret-test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-test-refresh-secret";
process.env.FRONTEND_URL = "http://localhost:3000";
