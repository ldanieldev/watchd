export function useApiErrorToast() {
  const toast = useToast()

  return (error: unknown, title: string, fallbackMessage: string) => {
    toast.add({
      title,
      description: extractApiErrorMessage(error, fallbackMessage),
      color: 'error'
    })
  }
}
