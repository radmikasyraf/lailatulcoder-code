import type { ChannelLoopController, ChannelLoopStore } from '@lailatul-coder/channel-base';
export declare function createChannelLoopController(store: ChannelLoopStore): ChannelLoopController;
export declare function isChannelCronEnabled(settings: {
    merged: {
        experimental?: {
            cron?: boolean;
        };
    };
}): boolean;
