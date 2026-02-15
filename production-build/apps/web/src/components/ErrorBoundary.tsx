'use client';

import React, { Component, ReactNode } from 'react';
import { Alert, Button } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return <>{this.props.fallback}</>;
      }

      return (
        <div className="p-4">
          <Alert
            message="אופס! משהו השתבש"
            description={
              <div>
                <p>אירעה שגיאה בלתי צפויה. אנא נסה לרענן את העמוד.</p>
                {process.env.NODE_ENV === 'development' && this.state.error && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm">פרטי השגיאה</summary>
                    <pre className="mt-2 text-xs bg-gray-100 p-2 rounded overflow-auto">
                      {this.state.error.message}
                      {'\n'}
                      {this.state.error.stack}
                    </pre>
                  </details>
                )}
              </div>
            }
            type="error"
            showIcon
            action={
              <Button 
                icon={<ReloadOutlined />} 
                onClick={this.handleReset}
                size="small"
              >
                נסה שוב
              </Button>
            }
          />
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

