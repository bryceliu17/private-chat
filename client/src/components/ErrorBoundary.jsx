import { Component } from "react";

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      error: null,
    };
  }

  static getDerivedStateFromError(error) {
    return {
      error,
    };
  }

  componentDidCatch(error, info) {
    console.error("UI crashed:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="page">
          <div className="login-card">
            <h1>Something went wrong / 页面出错</h1>
            <p className="login-error">
              {this.state.error.message || "Unknown UI error"}
            </p>
            <button onClick={() => window.location.reload()}>
              Reload / 刷新
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
