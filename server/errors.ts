/** Error with an HTTP status and a stable code that is safe to show to the client. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export const forbidden = () => new ApiError(403, 'FORBIDDEN', 'You do not have access to this workspace.');
