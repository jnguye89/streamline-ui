export interface Video {
    user: string | null;
    videoPath: string;
    processedPath: string;
    id: number;
    resumeTimestamp?: number;
    viewCount?: number;
    likeCount?: number;
    liked?: boolean;
    source?: string;
    title?: string;
    thumbnailUrl?: string;
    // Who can watch. Not sent by the API yet; the profile shows a chip when it is.
    visibility?: 'private' | 'free' | 'free_ads' | 'subscribers' | 'rent_buy';
}