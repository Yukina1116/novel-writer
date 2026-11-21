// Static check: トースト(<Toast />)は、ユーザーが操作する全てのレイアウトで描画されなければならない。
//
// 経緯: App.mobile.tsx に <Toast /> が一度も存在せず、モバイル（幅 1280px 未満）では
// showToast() がストアに値を入れるだけで誰にも見えなかった。データ保存・バックアップの失敗
// (hooks/useLocalSync.ts, useGlobalErrorHandlers.ts, 暗号化エクスポート/インポートのタイムアウト)や
// 画像生成・テキスト解析の失敗など、33 箇所の通知がモバイルで無言になっていた。
// コンポーネントは node 環境でマウントできないため、ソースの grep で固定する。

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (rel: string) => readFileSync(resolve(__dirname, '../..', rel), 'utf-8');

const countToastElements = (src: string) => (src.match(/<Toast\s*\/>/g) ?? []).length;

describe('<Toast /> is rendered in every layout that can show notifications', () => {
    it('REGRESSION: モバイルのルート(App.mobile.tsx)が <Toast /> を描画する', () => {
        const src = read('App.mobile.tsx');
        expect(src).toMatch(/import \{ Toast \} from ['"]\.\/components\/Toast['"]/);
        expect(countToastElements(src)).toBe(1); // 二重に描画しない
    });

    it('デスクトップのルート(App.tsx)は、プロジェクト選択画面とデスクトップ画面の 2 か所で <Toast /> を描画する', () => {
        // モバイル分岐(`return <AppMobile />`)は AppMobile 側が Toast を持つため、App.tsx 側には置かない
        expect(countToastElements(read('App.tsx'))).toBe(2);
    });

    it('モバイル分岐は AppMobile に委ねる（App.tsx が Toast を重ねて描画しない）', () => {
        const src = read('App.tsx');
        const mobileBranch = src.slice(src.indexOf('if (isMobile)'), src.indexOf('// Desktop View'));
        expect(mobileBranch).toMatch(/return <AppMobile \/>;/);
        expect(mobileBranch).not.toMatch(/<Toast/);
    });

    it('Toast は App.mobile.tsx のルート要素の内側(オーバーレイ群と同じ階層)に置く', () => {
        const src = read('App.mobile.tsx');
        // Toast は absolute 配置のため、relative なルートの直下の子であること
        const rootStart = src.indexOf('overflow-hidden relative');
        expect(rootStart).toBeGreaterThan(-1);
        expect(src.indexOf('<Toast />')).toBeGreaterThan(rootStart);
        // Tutorial / ModalManager と同じ「オーバーレイコンポーネント」の並びにある
        expect(src.indexOf('<Toast />')).toBeLessThan(src.indexOf('<ModalManager'));
    });
});
