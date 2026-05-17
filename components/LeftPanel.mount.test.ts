import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// MobileAuthSection は LeftPanel が isMobile=true のときだけ mount される契約を pin。
// 将来 isMobile ガードを誤って外すとデスクトップに認証 CTA が出るため、grep で防御する。

describe('LeftPanel mobile MobileAuthSection mount guard', () => {
    const leftPanelSource = readFileSync(resolve(__dirname, 'LeftPanel.tsx'), 'utf-8');

    it('mounts MobileAuthSection only when isMobile is true', () => {
        expect(leftPanelSource).toMatch(/\{isMobile && <MobileAuthSection \/>\}/);
    });

    it('imports MobileAuthSection from the colocated module', () => {
        expect(leftPanelSource).toMatch(/from ['"]\.\/MobileAuthSection['"]/);
    });
});
