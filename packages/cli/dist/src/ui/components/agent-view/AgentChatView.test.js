import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * AgentChatView error containment (#9290).
 *
 * The interactive session wraps the whole app in a single FATAL error
 * boundary: any render error logs [FATAL_RENDER_ERROR] and exits the
 * session ~5s later. The agent-tab view sits under it with no boundary
 * of its own, so one errored/incomplete teammate whose transcript
 * throws during render takes down the entire session when its tab is
 * opened. These tests pin the per-tab non-fatal boundary: the failing
 * tab degrades to a recoverable panel, the session (and other tabs)
 * keep running.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'ink-testing-library';
import { Text } from 'ink';
import { AgentChatView } from './AgentChatView.js';
// The transcript renderer is replaced by a stand-in that throws for the
// crashed teammate only — simulating an errored, incomplete member whose
// transcript render path raises — and renders normally otherwise. The
// boundary under test wraps this component, so the stand-in isolates the
// containment behavior from the real renderer's context needs.
vi.mock('./AgentChatContent.js', () => ({
    AgentChatContent: ({ instanceKey }) => {
        if (instanceKey === 'crashed@team') {
            throw new Error('teammate transcript boom');
        }
        return _jsxs(Text, { children: ["content:", instanceKey] });
    },
    AgentChatMissing: ({ label }) => _jsx(Text, { children: label }),
}));
const setAgentShellFocusedSpy = vi.hoisted(() => vi.fn());
vi.mock('../../contexts/AgentViewContext.js', () => ({
    useAgentViewState: () => ({
        agents: new Map([
            ['crashed@team', { interactiveAgent: { getCore: () => ({}) } }],
            ['healthy@team', { interactiveAgent: { getCore: () => ({}) } }],
        ]),
    }),
    useAgentViewActions: () => ({
        setAgentShellFocused: setAgentShellFocusedSpy,
    }),
}));
describe('AgentChatView error containment (#9290)', () => {
    // React logs caught render errors to console.error; silence it so the
    // test output stays clean (the boundary catching the error is the
    // point).
    let errorSpy;
    beforeEach(() => {
        errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
        setAgentShellFocusedSpy.mockClear();
    });
    afterEach(() => {
        errorSpy.mockRestore();
    });
    it('renders a healthy teammate transcript normally', () => {
        const { lastFrame } = render(_jsx(AgentChatView, { agentId: "healthy@team" }));
        expect(lastFrame()).toContain('content:healthy@team');
    });
    it('degrades a crashing teammate tab to a recoverable panel instead of propagating', () => {
        // Without the per-tab boundary this render propagates the throw to
        // the fatal top-level boundary, which exits the whole session —
        // exactly the reported crash.
        const { lastFrame } = render(_jsx(AgentChatView, { agentId: "crashed@team" }));
        const output = lastFrame() ?? '';
        expect(output).toContain('teammate transcript boom');
        expect(output.toLowerCase()).toContain('agent');
        expect(output).toContain('QWEN_DEBUG_LOG_FILE=1');
        // The panel must read as recoverable state, not a session death.
        expect(output).not.toContain('content:crashed@team');
    });
    it('clears the embedded-shell focus flag when a tab crashes', () => {
        // The crashing content is the only production writer of
        // agentShellFocused and never clears it on unmount (React error
        // #185); while the flag is stale the tab bar swallows left/right —
        // the only escape — so the boundary's componentDidCatch is the one
        // place that can still release the lock. The tab-switch resets cover
        // normal navigation but are unreachable once locked (#9290 review).
        render(_jsx(AgentChatView, { agentId: "crashed@team" }));
        expect(setAgentShellFocusedSpy).toHaveBeenCalledWith(false);
    });
    it('does not touch the focus flag for a healthy tab', () => {
        render(_jsx(AgentChatView, { agentId: "healthy@team" }));
        expect(setAgentShellFocusedSpy).not.toHaveBeenCalled();
    });
    it('recovers when switching from a crashed tab to a healthy one', () => {
        // The boundary state must be keyed per agent: with a shared boundary
        // instance the crashed tab's error state would keep every later tab
        // stuck in the fallback even though its transcript renders fine.
        const view = render(_jsx(AgentChatView, { agentId: "crashed@team" }));
        expect(view.lastFrame()).toContain('teammate transcript boom');
        view.rerender(_jsx(AgentChatView, { agentId: "healthy@team" }));
        expect(view.lastFrame()).toContain('content:healthy@team');
    });
    it('still renders the missing-agent panel for an unknown id', () => {
        const { lastFrame } = render(_jsx(AgentChatView, { agentId: "ghost@team" }));
        expect(lastFrame()).toContain('Agent "ghost@team" not found.');
    });
});
//# sourceMappingURL=AgentChatView.test.js.map