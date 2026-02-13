export type GameScreen =
  | 'main-menu'
  | 'track-select'
  | 'character-select'
  | 'race-settings'
  | 'loading'
  | 'countdown'
  | 'racing'
  | 'paused'
  | 'results'
  | 'options';

export type Difficulty = 'chill' | 'standard' | 'mean';

export interface RaceSettings {
  trackId: string;
  characterId: string;
  difficulty: Difficulty;
  mirrorMode: boolean;
  allowClones: boolean;
}

export class GameState {
  screen: GameScreen = 'main-menu';
  previousScreen: GameScreen = 'main-menu';
  raceSettings: RaceSettings = {
    trackId: 'rainbow-meadow',
    characterId: 'sparkle',
    difficulty: 'standard',
    mirrorMode: false,
    allowClones: false,
  };
  /** Volume settings 0..1 */
  musicVolume = 0.7;
  sfxVolume = 0.8;

  transition(to: GameScreen): void {
    this.previousScreen = this.screen;
    this.screen = to;
  }
}
