export type SoundName = 'move-self' | 'capture' | 'promote' | 'tenseconds' | 'win';

export class SoundManager {
  private audioCache: Map<SoundName, HTMLAudioElement> = new Map();
  private lastPlayedMoveKey: string | null = null;
  private lastTenSecondsTurnKey: string | null = null;
  private hasPlayedWinSound: boolean = false;
  private unlocked: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      const sounds: SoundName[] = ['move-self', 'capture', 'promote', 'tenseconds', 'win'];
      sounds.forEach((name) => {
        const audio = new Audio(`/sound/${name}.mp3`);
        audio.preload = 'auto';
        this.audioCache.set(name, audio);
      });

      const unlock = () => {
        if (this.unlocked) return;
        this.unlocked = true;
        this.audioCache.forEach((audio) => {
          audio.load();
        });
        window.removeEventListener('pointerdown', unlock);
        window.removeEventListener('keydown', unlock);
      };
      window.addEventListener('pointerdown', unlock, { once: true });
      window.addEventListener('keydown', unlock, { once: true });
    }
  }

  public play(name: SoundName): void {
    if (typeof window === 'undefined') return;
    try {
      const original = this.audioCache.get(name);
      if (original) {
        const audio = original.cloneNode() as HTMLAudioElement;
        audio.currentTime = 0;
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch(() => {
            if (name === 'win') {
              this.playSynthesizedWinSound();
            }
          });
        }
      } else {
        const audio = new Audio(`/sound/${name}.mp3`);
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch(() => {
            if (name === 'win') {
              this.playSynthesizedWinSound();
            }
          });
        }
      }
    } catch {
      if (name === 'win') {
        this.playSynthesizedWinSound();
      }
    }
  }

  private playSynthesizedWinSound(): void {
    if (typeof window === 'undefined') return;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      // Victory fanfare chords: C5 (523.25Hz), E5 (659.25Hz), G5 (783.99Hz), C6 (1046.50Hz)
      const notes = [
        { freq: 523.25, duration: 0.12, delay: 0 },
        { freq: 659.25, duration: 0.12, delay: 0.12 },
        { freq: 783.99, duration: 0.12, delay: 0.24 },
        { freq: 1046.50, duration: 0.50, delay: 0.36 }
      ];

      const now = ctx.currentTime;
      notes.forEach((note) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(note.freq, now + note.delay);

        gain.gain.setValueAtTime(0.01, now + note.delay);
        gain.gain.exponentialRampToValueAtTime(0.3, now + note.delay + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + note.delay + note.duration);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + note.delay);
        osc.stop(now + note.delay + note.duration + 0.05);
      });
    } catch {
      // Ignore audio context errors
    }
  }

  public handleStateUpdate(state: any, storeInstance: any): void {
    if (!storeInstance) return;

    if (state?.isGameOver && !storeInstance.isReplaying) {
      if (!this.hasPlayedWinSound) {
        this.hasPlayedWinSound = true;
        this.play('win');
      }
    } else if (!state?.isGameOver) {
      this.hasPlayedWinSound = false;
    }

    const lastMove = state?.lastMove;
    const historyLength = storeInstance.historyLength ?? 0;

    if (storeInstance.isReplaying || !lastMove) {
      if (storeInstance.isReplaying && lastMove) {
        this.lastPlayedMoveKey = `${lastMove.fromIndex}->${lastMove.toIndex}:${lastMove.type || 'move'}@${lastMove.moveId || historyLength}`;
      }
      return;
    }

    const currentMoveKey = `${lastMove.fromIndex}->${lastMove.toIndex}:${lastMove.type || 'move'}@${lastMove.moveId || historyLength}`;

    if (currentMoveKey !== this.lastPlayedMoveKey) {
      this.lastPlayedMoveKey = currentMoveKey;
      const moveType = lastMove.type;
      if (moveType === 'capture') {
        this.play('capture');
      } else if (moveType === 'promotion' || moveType === 'bunker_change') {
        this.play('promote');
      } else if (moveType === 'move' || moveType === 'failed_attack') {
        this.play('move-self');
      }
    }
  }

  public handleTimerUpdate(storeInstance: any): void {
    if (!storeInstance || storeInstance.isReplaying) return;
    const remaining = storeInstance.timerRemainingSeconds;
    const activeSeat = storeInstance.timerActiveSeat;
    const turnCount = storeInstance.getState()?.turnCount ?? 0;
    const limit = storeInstance.turnTimeLimit;

    if (limit === 0 || !storeInstance.turnEndsAt) {
      this.lastTenSecondsTurnKey = null;
      return;
    }

    const currentTurnKey = `${turnCount}_${activeSeat}`;

    if (remaining <= 10 && remaining > 0) {
      if (this.lastTenSecondsTurnKey !== currentTurnKey) {
        this.lastTenSecondsTurnKey = currentTurnKey;
        this.play('tenseconds');
      }
    } else if (remaining > 10) {
      if (this.lastTenSecondsTurnKey === currentTurnKey) {
        this.lastTenSecondsTurnKey = null;
      }
    }
  }
}

export const soundManager = new SoundManager();
