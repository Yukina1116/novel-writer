import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { shouldShowAiLoginNotice } from './aiLoginNoticeVisibility';
import { AI_LOGIN_HINT } from '../store/authConstants';

describe('shouldShowAiLoginNotice', () => {
    it('desktop + unauthenticated: 表示する', () => {
        expect(shouldShowAiLoginNotice('unauthenticated', false)).toBe(true);
    });

    it('desktop + initializing: 表示しない（ログイン済みでも一瞬出るちらつき防止）', () => {
        expect(shouldShowAiLoginNotice('initializing', false)).toBe(false);
    });

    it('desktop + authenticated: 表示しない', () => {
        expect(shouldShowAiLoginNotice('authenticated', false)).toBe(false);
    });

    it('mobile + unauthenticated: 表示しない（MobileAuthSection が常時案内を出すため二重表示しない）', () => {
        expect(shouldShowAiLoginNotice('unauthenticated', true)).toBe(false);
    });

    it('mobile + authenticated / initializing: 表示しない', () => {
        expect(shouldShowAiLoginNotice('authenticated', true)).toBe(false);
        expect(shouldShowAiLoginNotice('initializing', true)).toBe(false);
    });
});

describe('AI_LOGIN_HINT 文言', () => {
    it('ログインで AI 機能が使える事実のみを述べる（同期・保存を匂わせない）', () => {
        expect(AI_LOGIN_HINT).toBe('ログインすると AI 機能（小説生成・キャラクター作成など）が使えます');
        expect(AI_LOGIN_HINT).not.toMatch(/同期|保存|バックアップ|引き継/);
    });
});

describe('案内文言の共有（モバイルとデスクトップで同一）', () => {
    const read = (f: string) => readFileSync(resolve(__dirname, f), 'utf-8');

    it('MobileAuthSection は AI_LOGIN_HINT を参照し、文言をハードコードしない', () => {
        const src = read('MobileAuthSection.tsx');
        expect(src).toMatch(/AI_LOGIN_HINT/);
        expect(src).not.toMatch(/ログインすると/);
    });

    it('AiLoginNotice は AI_LOGIN_HINT を参照する', () => {
        const src = read('AiLoginNotice.tsx');
        expect(src).toMatch(/AI_LOGIN_HINT/);
        expect(src).not.toMatch(/ログインすると/);
    });

    it('RightPanel は AiLoginNotice を mount する', () => {
        const src = read('RightPanel.tsx');
        expect(src).toMatch(/<AiLoginNotice isMobile=\{isMobile\} \/>/);
    });
});
