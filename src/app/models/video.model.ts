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
}