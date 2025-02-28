import { Dialog } from '@angular/cdk/dialog';
import { Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, ViewChild } from '@angular/core';
import { gameManager, GameManager } from 'src/app/game/businesslogic/GameManager';
import { SettingsManager, settingsManager } from 'src/app/game/businesslogic/SettingsManager';
import { AttackModifier, AttackModifierDeck, AttackModifierType } from 'src/app/game/model/data/AttackModifier';
import { Character } from 'src/app/game/model/Character';
import { GameState } from 'src/app/game/model/Game';
import { AttackModifierDeckDialogComponent } from './attackmodifierdeck-dialog';
import { AttackModifierDeckFullscreenComponent } from './attackmodifierdeck-fullscreen';
import { Subscription } from 'rxjs';
import { CharacterBattleGoalsDialog } from '../battlegoal/dialog/battlegoal-dialog';

export class AttackModiferDeckChange {

  deck: AttackModifierDeck;
  type: string;
  values: string[];

  constructor(deck: AttackModifierDeck,
    type: string, ...values: string[]) {
    this.deck = deck;
    this.type = type;
    this.values = values;
  }

}

@Component({
  selector: 'ghs-attackmodifier-deck',
  templateUrl: './attackmodifierdeck.html',
  styleUrls: ['./attackmodifierdeck.scss']
})
export class AttackModifierDeckComponent implements OnInit, OnDestroy, OnChanges {

  @Input('deck') deck!: AttackModifierDeck;
  @Input('character') character!: Character;
  @Input() ally: boolean = false;
  @Input('numeration') numeration: string = "";
  @Input('bottom') bottom: boolean = false;
  @Output('before') before: EventEmitter<AttackModiferDeckChange> = new EventEmitter<AttackModiferDeckChange>();
  @Output('after') after: EventEmitter<AttackModiferDeckChange> = new EventEmitter<AttackModiferDeckChange>();
  @ViewChild('menu') menuElement!: ElementRef;
  @Input('fullscreen') fullscreen: boolean = true;
  @Input('vertical') vertical: boolean = false;
  @Input() townGuard: boolean = false;
  @Input() battleGoals: boolean = true;
  @Input() standalone: boolean = false;
  @Input() edition!: string;
  @Input() initTimeout: number = 1500;

  gameManager: GameManager = gameManager;
  settingsManager: SettingsManager = settingsManager;

  GameState = GameState;
  reveal: number = 0;
  edit: boolean = false;
  maxHeight: string = "";
  characterIcon: string = "";

  AttackModifierType = AttackModifierType;
  type: AttackModifierType = AttackModifierType.minus1;
  current: number = -1;
  drawing: boolean = false;
  drawTimeout: any = null;
  queue: number = 0;
  queueTimeout: any = null;
  newStyle: boolean = false;
  init: boolean = false;
  disabled: boolean = false;

  rollingIndex: number[] = [];
  rollingIndexPrev: number[] = [];
  compact: boolean = false;
  initServer: boolean = false;

  @ViewChild('drawCard') drawCard!: ElementRef;

  constructor(public element: ElementRef, private dialog: Dialog) {
    this.element.nativeElement.addEventListener('click', (event: any) => {
      let elements = document.elementsFromPoint(event.clientX, event.clientY);
      if (elements[0].classList.contains('attack-modifiers') && elements.length > 2) {
        (elements[2] as HTMLElement).click();
      }
    })
  };

  ngOnInit(): void {
    if (this.character) {
      this.deck = this.character.attackModifierDeck;
      this.edition = this.character.edition;
      this.numeration = "" + this.character.number;
      this.characterIcon = this.character.iconUrl;
    } else {
      this.battleGoals = false;
    }
    this.current = this.deck.current;
    this.compact = !this.drawing && this.fullscreen && settingsManager.settings.automaticAttackModifierFullscreen && settingsManager.settings.portraitMode && (window.innerWidth < 800 || window.innerHeight < 400);

    this.calcRolling();

    if (!this.init) {
      this.drawTimeout = setTimeout(() => {
        this.current = this.deck.current;
        this.drawTimeout = null;
        this.init = true;
      }, !settingsManager.settings.animations ? 0 : this.initTimeout)
    }

    this.uiChangeSubscription = gameManager.uiChange.subscribe({
      next: (fromServer: boolean) => { this.update(fromServer); }
    })

    if (this.edition && !this.newStyle) {
      this.newStyle = gameManager.newAmStyle(this.edition);
    }

    if (settingsManager.settings.fhStyle) {
      this.newStyle = true;
    }

    this.disabled = !this.standalone && (!this.townGuard && gameManager.game.state == GameState.draw || this.townGuard && gameManager.game.scenario != undefined);

    window.addEventListener('resize', (event) => {
      this.compact = settingsManager.settings.automaticAttackModifierFullscreen && settingsManager.settings.portraitMode && (window.innerWidth < 800 || window.innerHeight < 400);
    });

    window.addEventListener('fullscreenchange', (event) => {
      this.compact = settingsManager.settings.automaticAttackModifierFullscreen && settingsManager.settings.portraitMode && (window.innerWidth < 800 || window.innerHeight < 400);
    });
  }

  uiChangeSubscription: Subscription | undefined;

  ngOnDestroy(): void {
    if (this.uiChangeSubscription) {
      this.uiChangeSubscription.unsubscribe();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['deck']) {
      this.update()
    }
  }

  update(fromServer: boolean = false) {
    this.disabled = !this.standalone && (!this.townGuard && gameManager.game.state == GameState.draw || this.townGuard && gameManager.game.scenario != undefined);

    if (this.character && this.deck != this.character.attackModifierDeck) {
      this.deck = this.character.attackModifierDeck;
    }

    if (this.initServer && gameManager.stateManager.wsState() != WebSocket.OPEN) {
      this.initServer = false;
    }

    if (!this.deck.active) {
      if (this.queueTimeout) {
        clearTimeout(this.queueTimeout);
        this.queueTimeout = null;
      }
      this.queue = 0;
      this.drawing = false;
      this.current = this.deck.current;
      this.initServer = gameManager.stateManager.wsState() == WebSocket.OPEN;
    } else if (this.init && (!fromServer || this.initServer)) {
      if (this.current < this.deck.current) {
        this.queue = Math.max(0, this.deck.current - this.current);
        if (!this.queueTimeout) {
          this.queue--;
          this.current++;
          this.drawQueue();
        }
      } else if (!this.queueTimeout || this.deck.current < this.current + this.queue) {
        if (this.queueTimeout) {
          clearTimeout(this.queueTimeout);
          this.queueTimeout = null;
        }
        this.queue = 0;
        this.drawing = false;
        this.current = this.deck.current;
      }
    } else {
      this.current = this.deck.current;
      if (fromServer && !this.initServer) {
        this.initServer = true;
      }
    }

    if (settingsManager.settings.fhStyle) {
      this.newStyle = true;
    }

    this.calcRolling();

    this.compact = settingsManager.settings.automaticAttackModifierFullscreen && settingsManager.settings.portraitMode && (window.innerWidth < 800 || window.innerHeight < 400);
  }

  drawQueue() {
    this.drawing = true;
    this.element.nativeElement.getElementsByClassName('attack-modifiers')[0].classList.add('drawing');
    this.queueTimeout = setTimeout(() => {
      this.drawing = false;
      this.queueTimeout = null;
      if (this.queue > 0) {
        this.queue--;
        this.current++;
        this.drawQueue();
      } else {
        this.element.nativeElement.getElementsByClassName('attack-modifiers')[0].classList.remove('drawing');
        if (this.queue < 0) {
          this.queue = 0;
        }
      }
    }, !settingsManager.settings.animations ? 0 : (this.vertical ? 1050 : 1850));
  }

  draw(event: any) {
    if (this.compact && this.fullscreen) {
      this.openFullscreen(event);
    } else if (!this.disabled) {
      if (!this.drawTimeout && this.deck.current < (this.deck.cards.length - (this.queue == 0 ? 0 : 1))) {
        this.drawTimeout = setTimeout(() => {
          this.before.emit(new AttackModiferDeckChange(this.deck, "draw"));
          gameManager.attackModifierManager.drawModifier(this.deck);
          this.after.emit(new AttackModiferDeckChange(this.deck, "draw"));
          this.drawTimeout = null;
        }, !settingsManager.settings.animations ? 0 : 150)
      }
    } else {
      this.dialog.open(AttackModifierDeckDialogComponent, {
        panelClass: ['dialog'], data: {
          deck: this.deck,
          character: this.character,
          ally: this.ally,
          numeration: this.numeration,
          newStyle: this.newStyle,
          townGuard: this.townGuard,
          before: this.before,
          after: this.after
        }
      });
    }
  }

  openFullscreen(event: any) {
    this.dialog.open(AttackModifierDeckFullscreenComponent, {
      panelClass: ['fullscreen-panel'],
      backdropClass: ['fullscreen-backdrop'],
      data: {
        deck: this.deck,
        character: this.character,
        ally: this.ally,
        numeration: this.numeration,
        newStyle: this.newStyle,
        townGuard: this.townGuard,
        before: this.before,
        after: this.after
      }
    });
    event.preventDefault();
    event.stopPropagation();
  }

  openBattleGoals(event: any): void {
    this.dialog.open(CharacterBattleGoalsDialog, {
      panelClass: ['dialog'],
      data: { character: this.character, draw: !this.character.battleGoals || this.character.battleGoals.length == 0 }
    });
    event.preventDefault();
    event.stopPropagation();
  }

  calcRolling() {
    this.deck.cards.forEach((card, index) => {
      this.rollingIndex[index] = this.calcRollingIndex(index, this.current);
      this.rollingIndexPrev[index] = this.calcRollingIndex(index, this.current - 1);
    });

    this.deck.cards.forEach((card, index) => {
      if (this.current > 1 && !card.rolling && index < (this.current - 1) && this.deck.cards[index + 1].rolling && this.deck.cards[this.current - 1].rolling && (this.rollingIndex[index + 1] || index == this.current - 2)) {
        this.rollingIndex[index] = this.rollingIndex[index + 1] + (index == this.current - 2 ? 2 : 1);
      }
    })
  }

  calcRollingIndex(index: number, current: number): number {
    const am: AttackModifier = this.deck.cards[index];
    if (!am.rolling || am.active && this.deck.disgarded.indexOf(index) != -1 || current < 0) {
      return 0;
    }

    if (index == current - 2) {
      return 2;
    } else if (index < current - 2 && !am.active && this.deck.cards.slice(index, current - 1).every((attackModifier) => attackModifier.rolling)) {
      return current - index;
    } else if (index < current && am.active) {
      let rolling = 0;
      let rollingIndex = current - 2;
      while (rollingIndex > -1 && this.deck.cards[rollingIndex].rolling && !this.deck.cards[rollingIndex].active) {
        rollingIndex--;
        rolling++;
      }
      return 1 + this.deck.cards.slice(index, current - 1).filter((attackModifier) => attackModifier.active && this.deck.disgarded.indexOf(this.deck.cards.indexOf(attackModifier)) == -1).length + rolling;
    }

    return 0;
  }


  clickCard(index: number, event: any) {
    if (!this.drawing || index > this.current) {
      const am: AttackModifier = this.deck.cards[index];
      if (am.active && this.deck.disgarded.indexOf(index) == -1) {
        this.before.emit(new AttackModiferDeckChange(this.deck, "disgard", "" + index));
        this.deck.disgarded.push(index);
        this.after.emit(new AttackModiferDeckChange(this.deck, "disgard", "" + index));
      } else {
        this.open(event);
      }
    }
  }

  open(event: any) {
    if (gameManager.game.state == GameState.next && this.fullscreen && settingsManager.settings.automaticAttackModifierFullscreen && settingsManager.settings.portraitMode && (window.innerWidth < 800 || window.innerHeight < 400)) {
      this.openFullscreen(event);
    } else {
      this.dialog.open(AttackModifierDeckDialogComponent, {
        panelClass: ['dialog'], data: {
          deck: this.deck,
          character: this.character,
          ally: this.ally,
          numeration: this.numeration,
          newStyle: this.newStyle,
          townGuard: this.townGuard,
          before: this.before,
          after: this.after
        }
      });
      event.preventDefault();
      event.stopPropagation();
    }
  }

}
