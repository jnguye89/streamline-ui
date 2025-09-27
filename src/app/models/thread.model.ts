export interface ThreadModel {
    id?: number,
    threadText: string,
    user?: UserModel,
    createdAt?: string;
}

export interface UserModel {
    username: string;
}