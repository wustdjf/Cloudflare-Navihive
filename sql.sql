-- 创建分组表
CREATE TABLE IF NOT EXISTS groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT, 
    name TEXT NOT NULL, 
    order_num INTEGER NOT NULL, 
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, 
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)

-- 创建站点表
CREATE TABLE IF NOT EXISTS sites ( 
  id INTEGER PRIMARY KEY AUTOINCREMENT, 
  group_id INTEGER NOT NULL, 
  name TEXT NOT NULL,
  url TEXT NOT NULL, 
  icon TEXT, 
  description TEXT, 
  notes TEXT, 
  order_num INTEGER NOT NULL, 
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, 
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, 
  FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE 
)

  -- 创建配置表
CREATE TABLE IF NOT EXISTS configs ( 
  key TEXT PRIMARY KEY, 
  value TEXT NOT NULL, 
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, 
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP 
)

  -- 设置初始化标志
INSERT INTO configs (key, value) VALUES ('DB_INITIALIZED', 'true')
