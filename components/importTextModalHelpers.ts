export type CharacterAction = 'create' | 'link' | 'ignore';
export type TermAction = 'world' | 'knowledge' | 'ignore';

export const isSelectedCharacterAction = (action: CharacterAction | undefined): boolean =>
  action === 'create' || action === 'link';

export const isSelectedTermAction = (action: TermAction | undefined): boolean =>
  action === 'world' || action === 'knowledge';
