export const ROOT_FLAG_DISABLE_MASTER:number = 1048576;

export function isMasterKeyDisabled(flags:number): boolean {
    return (flags && (flags & ROOT_FLAG_DISABLE_MASTER) == ROOT_FLAG_DISABLE_MASTER);
}
