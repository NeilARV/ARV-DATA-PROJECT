export type ChannelSummary = {
    id: string;
    name: string;
    description: string | null;
    unreadCount: number;
    hasMention: boolean;
};
