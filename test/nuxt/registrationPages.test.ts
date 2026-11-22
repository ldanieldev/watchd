import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { enableAutoUnmount } from '@vue/test-utils'
import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { UApp } from '#components'
import LoginPage from '~/pages/auth/login.vue'
import RegisterPage from '~/pages/auth/register.vue'

enableAutoUnmount(afterEach)

const registration = vi.hoisted(() => ({ open: true }))
registerEndpoint('/api/auth/registration', () => ({ open: registration.open }))

const inApp = (page: object) => defineComponent({ render: () => h(UApp, null, { default: () => h(page) }) })

describe('register page', () => {
  it('shows the form when registration is open', async () => {
    registration.open = true
    const wrapper = await mountSuspended(inApp(RegisterPage))
    expect(wrapper.text()).toContain('Create an account')
    expect(wrapper.text()).not.toContain('Registration is closed')
  })

  it('shows a closed notice with a sign-in link instead of the form', async () => {
    registration.open = false
    const wrapper = await mountSuspended(inApp(RegisterPage))
    expect(wrapper.text()).toContain('Registration is closed')
    expect(wrapper.text()).not.toContain('Create an account')
    expect(wrapper.find('a[href="/auth/login"]').exists()).toBe(true)
  })
})

describe('login page', () => {
  it('links to registration when open', async () => {
    registration.open = true
    const wrapper = await mountSuspended(inApp(LoginPage))
    expect(wrapper.find('a[href="/auth/register"]').exists()).toBe(true)
  })

  it('hides the registration link when closed', async () => {
    registration.open = false
    const wrapper = await mountSuspended(inApp(LoginPage))
    expect(wrapper.find('a[href="/auth/register"]').exists()).toBe(false)
  })
})
