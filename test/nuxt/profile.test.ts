import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { createError, readBody } from 'h3'
import ProfileDeleteAccountCard from '~/components/profile/deleteAccountCard.vue'
import ProfilePasswordForm from '~/components/profile/passwordForm.vue'
import ProfilePersonalInfoForm from '~/components/profile/personalInfoForm.vue'

const owner = { id: 1, name: 'Owner', email: 'owner@example.com' }

const { user, toastAdd, clearSession, fetchSession, deleteUser, updateUser, changePassword, failures } = vi.hoisted(() => ({
  user: { value: { id: 1, name: 'Owner', email: 'owner@example.com' } },
  toastAdd: vi.fn(),
  clearSession: vi.fn(),
  fetchSession: vi.fn(),
  deleteUser: vi.fn(),
  updateUser: vi.fn(),
  changePassword: vi.fn(),
  failures: { statusMessage: '' as string }
}))

mockNuxtImport('useUserSession', () => () => ({ user, clear: clearSession, fetch: fetchSession }))
mockNuxtImport('useToast', () => () => ({ add: toastAdd }))

function rejectIfAsked() {
  if (failures.statusMessage) throw createError({ statusCode: 403, statusMessage: failures.statusMessage })
}

registerEndpoint('/api/users/1', {
  method: 'DELETE',
  handler: () => {
    rejectIfAsked()
    deleteUser()
    return { success: true }
  }
})

registerEndpoint('/api/users/1', {
  method: 'PUT',
  handler: async (event) => {
    const body = await readBody(event)
    rejectIfAsked()
    updateUser(body)
    return { id: 1, ...body }
  }
})

registerEndpoint('/api/auth/password', {
  method: 'PUT',
  handler: async (event) => {
    const body = await readBody(event)
    rejectIfAsked()
    changePassword(body)
    return { success: true }
  }
})

// $fetch here is a real h3 round trip, so the handler continuation lands a macrotask later than flushPromises
const settle = async () => {
  await flushPromises()
  await new Promise(resolve => setTimeout(resolve, 10))
  await flushPromises()
}

const dialog = () => document.body.querySelector('[role="dialog"]')
const buttonLabelled = (label: string) =>
  [...document.body.querySelectorAll('button')].find(b => b.textContent?.trim() === label)

beforeEach(() => {
  vi.clearAllMocks()
  failures.statusMessage = ''
  user.value = { ...owner }
})

afterEach(async () => {
  await settle()
  document.body.innerHTML = ''
})

describe('ProfileDeleteAccountCard', () => {
  it('keeps the confirmation modal closed until the card button is clicked', async () => {
    const card = await mountSuspended(ProfileDeleteAccountCard)
    expect(dialog()).toBeNull()

    await card.get('button').trigger('click')
    await flushPromises()

    expect(dialog()?.textContent).toContain('Are you sure you want to delete your account?')
  })

  it('closes the modal again on cancel without calling the endpoint', async () => {
    const card = await mountSuspended(ProfileDeleteAccountCard)
    await card.get('button').trigger('click')
    await flushPromises()

    buttonLabelled('Cancel')!.click()
    await settle()

    expect(dialog()).toBeNull()
    expect(deleteUser).not.toHaveBeenCalled()
  })

  it('deletes the account and clears the session on confirm', async () => {
    const card = await mountSuspended(ProfileDeleteAccountCard)
    await card.get('button').trigger('click')
    await flushPromises()

    buttonLabelled('Delete')!.click()
    await vi.waitFor(() => expect(clearSession).toHaveBeenCalled())

    expect(deleteUser).toHaveBeenCalled()
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ color: 'success' }))
  })

  it('surfaces the server message and keeps the session when deletion fails', async () => {
    failures.statusMessage = 'Forbidden'
    const card = await mountSuspended(ProfileDeleteAccountCard)
    await card.get('button').trigger('click')
    await flushPromises()

    buttonLabelled('Delete')!.click()
    await vi.waitFor(() =>
      expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ color: 'error', description: 'Forbidden' })))

    expect(deleteUser).not.toHaveBeenCalled()
    expect(clearSession).not.toHaveBeenCalled()
  })
})

describe('ProfilePersonalInfoForm', () => {
  it('seeds the fields from the current session', async () => {
    const form = await mountSuspended(ProfilePersonalInfoForm)

    expect(form.get<HTMLInputElement>('input[type="text"]').element.value).toBe('Owner')
    expect(form.get<HTMLInputElement>('input[type="email"]').element.value).toBe('owner@example.com')
  })

  it('submits the edited profile and refreshes the session', async () => {
    const form = await mountSuspended(ProfilePersonalInfoForm)
    await form.get('input[type="text"]').setValue('New Name')

    await form.get('form').trigger('submit')
    await vi.waitFor(() => expect(fetchSession).toHaveBeenCalled())

    expect(updateUser).toHaveBeenCalledWith({ name: 'New Name', email: 'owner@example.com' })
  })

  it('blocks submission of an empty name', async () => {
    const form = await mountSuspended(ProfilePersonalInfoForm)
    await form.get('input[type="text"]').setValue('')

    await form.get('form').trigger('submit')
    await settle()

    expect(updateUser).not.toHaveBeenCalled()
    expect(form.text()).toContain('Name is required')
  })
})

describe('ProfilePasswordForm', () => {
  const fill = async (form: Awaited<ReturnType<typeof mountSuspended>>, values: string[]) => {
    const inputs = form.findAll('input[type="password"]')
    for (const [index, value] of values.entries()) await inputs[index]!.setValue(value)
  }

  it('refuses to submit when the confirmation does not match', async () => {
    const form = await mountSuspended(ProfilePasswordForm)
    await fill(form, ['oldpassword', 'newpassword123', 'differentpassword'])

    await form.get('form').trigger('submit')
    await settle()

    expect(changePassword).not.toHaveBeenCalled()
    expect(form.text()).toContain('Passwords do not match')
  })

  it('sends only the current and new password, then clears the fields', async () => {
    const form = await mountSuspended(ProfilePasswordForm)
    await fill(form, ['oldpassword', 'newpassword123', 'newpassword123'])

    await form.get('form').trigger('submit')
    await vi.waitFor(() =>
      expect(form.findAll('input[type="password"]').map(i => (i.element as HTMLInputElement).value)).toEqual(['', '', '']))

    expect(changePassword).toHaveBeenCalledWith({ currentPassword: 'oldpassword', newPassword: 'newpassword123' })
  })

  it('surfaces the server message when the change is rejected', async () => {
    failures.statusMessage = 'Current password is incorrect'
    const form = await mountSuspended(ProfilePasswordForm)
    await fill(form, ['wrongpassword', 'newpassword123', 'newpassword123'])

    await form.get('form').trigger('submit')
    await vi.waitFor(() => expect(toastAdd).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'error', description: 'Current password is incorrect' })))
  })
})
