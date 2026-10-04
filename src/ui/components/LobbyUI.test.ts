import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Lobby and Room Header Logo Layout', () => {
  it('should include vertical mode media queries in lobby.css aligning the logo to the left', () => {
    const cssPath = path.resolve(__dirname, '../styles/lobby.css');
    const cssContent = fs.readFileSync(cssPath, 'utf-8');

    // Verify vertical mode media queries for lobby and room header
    expect(cssContent).toContain('@media (max-width: 1150px), (orientation: portrait)');
    expect(cssContent).toContain('@media (max-width: 640px)');

    // Verify left-alignment styling for header bar, left spacer hidden, center logo flex-start
    const verticalBlockMatch = cssContent.match(
      /@media \(max-width: 1150px\), \(orientation: portrait\)[\s\S]*?\.lobby-header-bar[\s\S]*?\.lobby-header-left\s*\{\s*display:\s*none;?\s*\}[\s\S]*?\.lobby-header-center[\s\S]*?justify-content:\s*flex-start/
    );
    expect(verticalBlockMatch).not.toBeNull();
  });

  it('should have lobby and room HTML rendering .lobby-header-bar with logo and rules button', () => {
    const tsPath = path.resolve(__dirname, 'LobbyUI.ts');
    const tsContent = fs.readFileSync(tsPath, 'utf-8');

    // Both auth/lobby view and room view should render lobby-header-bar with logo and rules
    const matches = Array.from(tsContent.matchAll(/class="lobby-header-bar"/g));
    expect(matches.length).toBeGreaterThanOrEqual(2);

    const logoMatches = Array.from(tsContent.matchAll(/class="lobby-menu-logo"/g));
    expect(logoMatches.length).toBeGreaterThanOrEqual(2);
  });
});

describe('Lobby Title and Room Details Row Horizontal Separation Lines', () => {
  it('should declare --Lobby_Header_line_color variable in theme.css', () => {
    const themeCssPath = path.resolve(__dirname, '../styles/theme.css');
    const themeCss = fs.readFileSync(themeCssPath, 'utf-8');

    expect(themeCss).toContain('--Lobby_Header_line_color:');
  });

  it('should configure horizontal separation line pseudo-elements for .lobby-tag-title in lobby.css', () => {
    const cssPath = path.resolve(__dirname, '../styles/lobby.css');
    const cssContent = fs.readFileSync(cssPath, 'utf-8');

    expect(cssContent).toMatch(/\.lobby-tag-title::before,\s*\.lobby-tag-title::after\s*\{[\s\S]*?flex:\s*1/);
    expect(cssContent).toContain('--Lobby_Header_line_color');
  });

  it('should configure horizontal separation line pseudo-elements for .lobby-room-code-badge in lobby.css', () => {
    const cssPath = path.resolve(__dirname, '../styles/lobby.css');
    const cssContent = fs.readFileSync(cssPath, 'utf-8');

    expect(cssContent).toMatch(/\.lobby-room-code-badge::before,\s*\.lobby-room-code-badge::after\s*\{[\s\S]*?flex:\s*1/);
    expect(cssContent).toContain('.lobby-room-details-row');
  });

  it('should structure HTML with lobby title text span and room details row in LobbyUI.ts', () => {
    const tsPath = path.resolve(__dirname, 'LobbyUI.ts');
    const tsContent = fs.readFileSync(tsPath, 'utf-8');

    expect(tsContent).toContain('class="lobby-tag-title"');
    expect(tsContent).toContain('class="lobby-tag-title-text"');
    expect(tsContent).toContain('class="lobby-room-code-badge"');
    expect(tsContent).toContain('class="lobby-room-details-row"');
  });
});

describe('Lobby Display Name and Room Action Buttons Styling', () => {
  it('should declare theme variables for display name text color and room buttons in theme.css', () => {
    const themeCssPath = path.resolve(__dirname, '../styles/theme.css');
    const themeCss = fs.readFileSync(themeCssPath, 'utf-8');

    expect(themeCss).toContain('--Lobby_DisplayName_text_color: #ffffff;');
    expect(themeCss).toContain('--Room_ready_btn_fill_color: rgba(74, 222, 128, 0.2);');
    expect(themeCss).toContain('--Room_assign_bots_btn_fill_color: rgba(74, 222, 128, 0.2);');
  });

  it('should apply white text color to #player-name-input in lobby.css', () => {
    const cssPath = path.resolve(__dirname, '../styles/lobby.css');
    const cssContent = fs.readFileSync(cssPath, 'utf-8');

    expect(cssContent).toMatch(/#player-name-input\s*\{[\s\S]*?color:\s*var\(--Lobby_DisplayName_text_color/);
  });

  it('should apply transparent light green styling to ready up and assign bots buttons in lobby.css', () => {
    const cssPath = path.resolve(__dirname, '../styles/lobby.css');
    const cssContent = fs.readFileSync(cssPath, 'utf-8');

    expect(cssContent).toMatch(/#btn-toggle-ready[\s\S]*?--Room_ready_btn_fill_color/);
    expect(cssContent).toMatch(/#btn-assign-bots-start[\s\S]*?--Room_assign_bots_btn_fill_color/);
  });
});
