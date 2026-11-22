import { isRegistrationOpen } from '~~/server/utils/registration'

export default defineEventHandler(async () => ({ open: await isRegistrationOpen() }))
