import React from 'react';

// React render 中に throw された error を捕捉してフォールバック UI を出す Class Component。
// `componentDidCatch` / `getDerivedStateFromError` は React 19 でも Class Component 専用 API。
//
// global error / unhandledrejection の捕捉は `hooks/useGlobalErrorHandlers.ts` 側で
// 行う (Class Component の責務とは別レイヤー)。本コンポーネントは
// 「render tree 内で throw された場合のフォールバック UI 出力」だけに集中する。

export interface AppErrorBoundaryProps {
    children: React.ReactNode;
    // テスト容易性のため side-effect を注入可能にする。本番呼び出しはデフォルト値で OK。
    onError?: (error: Error, info: { componentStack?: string | null }) => void;
    // ロード時間が長いユーザー向けの reload ボタン挙動を差し替えたい場合のフック。
    onReloadRequest?: () => void;
}

interface AppErrorBoundaryState {
    error: Error | null;
}

const isDev = (): boolean => {
    // Vite の dev/prod 判定。`import.meta.env.PROD` が production build で `true`。
    try {
        return !import.meta.env.PROD;
    } catch {
        return false;
    }
};

export class AppErrorBoundary extends React.Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
    constructor(props: AppErrorBoundaryProps) {
        super(props);
        this.state = { error: null };
        this.handleReload = this.handleReload.bind(this);
    }

    static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
        return { error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo): void {
        // logger 経由で BE と一貫した観測性を確保する手も検討したが、FE は Cloud Logging 直接統合が
        // 無いため `console.error` のままで良い (browser DevTools / Sentry 等の将来導入時にここを差し替える)。
        // eslint-disable-next-line no-console
        console.error('[AppErrorBoundary] caught render error', {
            message: error.message,
            stack: error.stack,
            componentStack: info.componentStack,
        });
        this.props.onError?.(error, { componentStack: info.componentStack });
    }

    handleReload(): void {
        if (this.props.onReloadRequest) {
            this.props.onReloadRequest();
            return;
        }
        // 本番経路: そのままリロード
        if (typeof window !== 'undefined') {
            window.location.reload();
        }
    }

    render(): React.ReactNode {
        if (this.state.error === null) {
            return this.props.children;
        }
        const dev = isDev();
        return (
            <div
                role="alert"
                style={{
                    padding: '24px',
                    margin: '24px auto',
                    maxWidth: '720px',
                    border: '1px solid #d33',
                    borderRadius: '8px',
                    backgroundColor: '#fff5f5',
                    color: '#222',
                    fontFamily: 'system-ui, -apple-system, "Hiragino Kaku Gothic ProN", sans-serif',
                }}
            >
                <h2 style={{ marginTop: 0 }}>エラーが発生しました</h2>
                <p>
                    申し訳ありません。アプリケーションでエラーが発生しました。
                    ページをリロードしてやり直してください。
                </p>
                <p style={{ fontSize: '0.9em', color: '#555' }}>
                    未保存の変更がある場合は、リロード前にバックアップ Export をご検討ください。
                </p>
                <button
                    type="button"
                    onClick={this.handleReload}
                    style={{
                        padding: '8px 16px',
                        marginTop: '12px',
                        cursor: 'pointer',
                        border: 'none',
                        borderRadius: '4px',
                        backgroundColor: '#d33',
                        color: '#fff',
                    }}
                >
                    リロード
                </button>
                {dev && this.state.error && (
                    <pre
                        style={{
                            marginTop: '24px',
                            padding: '12px',
                            backgroundColor: '#fff',
                            border: '1px solid #ddd',
                            borderRadius: '4px',
                            overflow: 'auto',
                            fontSize: '0.8em',
                        }}
                    >
                        {this.state.error.message}
                        {'\n\n'}
                        {this.state.error.stack}
                    </pre>
                )}
            </div>
        );
    }
}
