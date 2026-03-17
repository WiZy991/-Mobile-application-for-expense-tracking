-- Таблица тарифов подписок
CREATE TABLE IF NOT EXISTS subscription_plans (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL,
  billing_period VARCHAR(50) DEFAULT 'monthly' CHECK (billing_period IN ('monthly', 'yearly')),
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_popular BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Таблица активных подписок клиентов
CREATE TABLE IF NOT EXISTS client_subscriptions (
  id SERIAL PRIMARY KEY,
  client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  plan_id INTEGER REFERENCES subscription_plans(id) ON DELETE RESTRICT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  next_billing_date DATE NOT NULL,
  auto_renewal BOOLEAN DEFAULT true,
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled', 'suspended')),
  sbis_subscription_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Индексы
CREATE INDEX IF NOT EXISTS idx_client_subscriptions_client_id ON client_subscriptions(client_id);
CREATE INDEX IF NOT EXISTS idx_client_subscriptions_plan_id ON client_subscriptions(plan_id);
CREATE INDEX IF NOT EXISTS idx_client_subscriptions_status ON client_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_client_subscriptions_end_date ON client_subscriptions(end_date);
CREATE INDEX IF NOT EXISTS idx_client_subscriptions_next_billing_date ON client_subscriptions(next_billing_date);

-- Вставка тарифов по умолчанию
INSERT INTO subscription_plans (name, code, description, price, billing_period, features, is_popular, sort_order) VALUES
('Базовый', 'basic', 'Базовый тариф для малого бизнеса', 5000, 'monthly', 
 '["До 5 пользователей", "Базовая техподдержка", "Доступ к базе знаний", "Email уведомления"]'::jsonb, 
 false, 1),
('Стандартный', 'standard', 'Стандартный тариф для среднего бизнеса', 15000, 'monthly',
 '["До 20 пользователей", "Приоритетная техподдержка", "Выезд специалиста", "SMS и Email уведомления", "Автоматическое продление лицензий"]'::jsonb,
 true, 2),
('Профессиональный', 'professional', 'Профессиональный тариф для крупного бизнеса', 35000, 'monthly',
 '["Неограниченное количество пользователей", "24/7 техподдержка", "Персональный менеджер", "Все виды уведомлений", "Автоматическое продление всех ресурсов", "Приоритетная обработка заявок"]'::jsonb,
 false, 3),
('Базовый (годовой)', 'basic_yearly', 'Базовый тариф со скидкой при оплате за год', 50000, 'yearly',
 '["До 5 пользователей", "Базовая техподдержка", "Доступ к базе знаний", "Email уведомления", "Скидка 17%"]'::jsonb,
 false, 4),
('Стандартный (годовой)', 'standard_yearly', 'Стандартный тариф со скидкой при оплате за год', 150000, 'yearly',
 '["До 20 пользователей", "Приоритетная техподдержка", "Выезд специалиста", "SMS и Email уведомления", "Автоматическое продление лицензий", "Скидка 17%"]'::jsonb,
 false, 5),
('Профессиональный (годовой)', 'professional_yearly', 'Профессиональный тариф со скидкой при оплате за год', 350000, 'yearly',
 '["Неограниченное количество пользователей", "24/7 техподдержка", "Персональный менеджер", "Все виды уведомлений", "Автоматическое продление всех ресурсов", "Приоритетная обработка заявок", "Скидка 17%"]'::jsonb,
 false, 6)
ON CONFLICT (code) DO NOTHING;
