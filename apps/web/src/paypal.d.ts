export {}

declare global {
  interface Window {
    paypal?: {
      Buttons: (options: {
        readonly createOrder: () => Promise<string>
        readonly onApprove: (data: { readonly orderID: string }) => Promise<void>
        readonly onError: (error: unknown) => void
      }) => { render: (selector: string) => Promise<void> }
    }
  }
}
