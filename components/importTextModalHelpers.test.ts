import { describe, it, expect } from 'vitest';
import { isSelectedCharacterAction, isSelectedTermAction } from './importTextModalHelpers';

describe('isSelectedCharacterAction', () => {
  it('returns false for undefined (Issue #107 regression pin: default-OFF)', () => {
    expect(isSelectedCharacterAction(undefined)).toBe(false);
  });

  it('returns false for ignore', () => {
    expect(isSelectedCharacterAction('ignore')).toBe(false);
  });

  it('returns true for create', () => {
    expect(isSelectedCharacterAction('create')).toBe(true);
  });

  it('returns true for link', () => {
    expect(isSelectedCharacterAction('link')).toBe(true);
  });
});

describe('isSelectedTermAction', () => {
  it('returns false for undefined (Issue #107 regression pin: default-OFF for terms)', () => {
    expect(isSelectedTermAction(undefined)).toBe(false);
  });

  it('returns false for ignore', () => {
    expect(isSelectedTermAction('ignore')).toBe(false);
  });

  it('returns true for world', () => {
    expect(isSelectedTermAction('world')).toBe(true);
  });

  it('returns true for knowledge', () => {
    expect(isSelectedTermAction('knowledge')).toBe(true);
  });
});
