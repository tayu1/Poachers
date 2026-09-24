# POACHERS - Game Rules

![Poachers Rules Overview](/assets/rules_pic.webp)

Poachers is a 2–4 Player, 2-Team (North-South vs. East-West) Turn-Based Board Game.

**Objective:** Win by capturing **Both** opposing Kings (or by capturing all enemy pieces except one King).

## Board & Control

**Team MidLine:** You control your team's pieces on *your half of the board*. If you move a piece across the center line - control transfers to your teammate. (Each team has its own midline)

**The Hill:** A 2x2 area in the center of the board. Used for *Card Refills* and *Pawn Promotions*.

## Pieces & Movement

**Pawns:** Move one square in 4 orthogonal directions, attack in 4 diagonals.

**Rooks, Bishops, Knights:** Move like in Chess.

**Kings:** Move like in Chess. Can't touch enemy King. Can't cross the team midline (each player has 1 King max).

## Card System (Poker Mechanics)

**Setup:** Each player starts with 3 Trench Cards (Position Cards used for resolving attacks) and 3 Base Cards (6 cards total per player: Left, Center, Right).

**Trench & Base Alignment:** Each Trench slot holds 1 active Trench Card and is backed up 1-to-1 by its corresponding Base Card (Left backs up Left, Center backs up Center, Right backs up Right). A card can be in Base position `i` only if Trench position `i` is full; otherwise, it immediately jumps from Base `i` to Trench `i`. A card is strictly either in the Trench or in the Base, never in both at the same time. When a Trench Card is used in combat, the corresponding Base Card immediately moves up to replace it.

**Pre-Turn Swap:** Before your move, you may swap any of your cards (between Trench slots, between Base slots, or Trench <-> Base), or Pass a card from your Base Deck to your Teammate.

**End-Turn Hill Bonus:** After your turn ends, *if you have a piece standing on your half of the Hill* - you get 1 card into an empty Base Deck slot (max 3 Base cards).

**Card Acquisition:** Players get new cards by capturing an opponent's piece in combat (Defender's card goes to Attacker's Base Deck), the End-Turn Hill Bonus, or when a Teammate passes a card to them.

## Resolving Attacks

**Attack on King or by King:** Results in immediate capture without cards involved.

**Other Piece-on-Piece Attacks:** Resolved via a Poker hand:
Best 5-card poker hand wins. The pool consists of:

**5 Public Cards:** 3 Cards always face-up (Flop), 2 more Cards are revealed for attack resolution.

**Position Cards:** Each team uses their 2 Position-Cards corresponding to the attacked square coordinates (row or column).

**Attacker Wins Hand:** A capture, and Defender's card goes to Attacker's Base Deck (if space available).

**Attacker Loses Hand:** Attacker move is blocked (Rooks/Bishops slide to touch the defender).

**Poker Hand Draw:** Attacker wins by default.

**Cleanup and Discard:** Used cards are discarded back to the deck (except captured Defender card which goes to Attacker). Position cards are immediately replaced by their backup Base Card if available. 3 new public cards are opened and turn passes.

## Special Mechanics

### Bunkers

**Bunkered Pieces** - (shown as a circle over the piece) initially set to the side pawns of each player.

Bunkered pieces cannot move or attack until the bunker is released.

**Combat:** When attacking bunkered pieces: Attack resolves normally as explained, but the *Attacking piece is captured in any case.*

**Changing Bunkered Pieces** (counts as a turn):

Click a bunkered piece *twice* to enter "Set Bunker Mode":
Click another piece in your control ( *but not on the Hill* ) to transfer the bunker mode / Click the bunkered piece a 3rd time to release it without transferring / Click outside to cancel.

### Pawn Promotion / Resurrect Captured Pieces

Possible when you have a Pawn on *your half of the Center Hill.*

Resurrect your captured pieces by clicking them, and then clicking on the Hill Pawn (this counts as a turn).

**Restrictions to Pawn Promotions:** 1 King per player half. Kings can't touch enemy Kings. No 2 same-team Bishops on the same colored square.