export interface AdminCustomer {
  id: string
  fullName: string
  email: string | null
  phone: string | null
}

export interface UpsertCustomerInput {
  id: string | null
  fullName: string
  email: string | null
  phone: string | null
  isActive: boolean
}

export interface UpsertCustomerResponse {
  id: string
  fullName: string
  email: string | null
  phone: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}
