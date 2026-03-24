const getRecipientEmail = (users: string[] | undefined, userLoggedIn: { email?: string } | null): string | undefined =>
  users?.filter((userToFilter) => userToFilter !== userLoggedIn?.email)[0];

export default getRecipientEmail;
