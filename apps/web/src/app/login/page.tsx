'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Form, Input, Button, Card, App } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useAuth } from '../../contexts/AuthContext';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [loading, setLoading] = useState(false);
  const { message } = App.useApp();

  const handleLogin = async (values: { email: string; password: string }) => {
    setLoading(true);
    try {
      // Call login with email and password - exactly as defined in schema
      await login(values.email, values.password);
      message.success('התחברת בהצלחה');
      router.push('/');
    } catch (error: any) {
      console.error('Login error:', error);
      message.error(error?.message || 'שגיאה בהתחברות');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f0f2f5'
    }}>
      <Card title="התחברות למערכת" style={{ width: 400 }}>
        <Form
          name="login"
          onFinish={handleLogin}
          autoComplete="off"
          layout="vertical"
        >
          <Form.Item
            name="email"
            rules={[
              { required: true, message: 'אנא הזן כתובת דוא"ל' },
              { type: 'email', message: 'כתובת דוא"ל לא תקינה' }
            ]}
          >
            <Input 
              prefix={<UserOutlined />} 
              placeholder="דוא״ל" 
              size="large"
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: 'אנא הזן סיסמה' }]}
          >
            <Input.Password 
              prefix={<LockOutlined />} 
              placeholder="סיסמה" 
              size="large"
            />
          </Form.Item>

          <Form.Item>
            <Button 
              type="primary" 
              htmlType="submit" 
              loading={loading}
              block
              size="large"
            >
              התחבר
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
} 