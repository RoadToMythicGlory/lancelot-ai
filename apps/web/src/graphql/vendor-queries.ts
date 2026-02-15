import { gql } from '@apollo/client';

// Vendor Queries
export const GET_VENDORS = gql`
  query GetVendors($filter: VendorFilter) {
    vendors(filter: $filter) {
      id
      name
      hebrewName
      category
      contactName
      contactPhone
      contactEmail
      alternateContactName
      alternateContactPhone
      address {
        street
        city
        postalCode
        country
      }
      website
      notes
      isActive
      createdAt
      updatedAt
    }
  }
`;

export const GET_VENDOR = gql`
  query GetVendor($id: ID!) {
    vendor(id: $id) {
      id
      name
      hebrewName
      category
      contactName
      contactPhone
      contactEmail
      alternateContactName
      alternateContactPhone
      address {
        street
        city
        postalCode
        country
      }
      website
      notes
      isActive
      createdBy {
        id
        firstName
        lastName
      }
      createdAt
      updatedAt
    }
  }
`;

// Vendor Mutations
export const CREATE_VENDOR = gql`
  mutation CreateVendor($input: CreateVendorInput!) {
    createVendor(input: $input) {
      id
      name
      hebrewName
      category
      contactName
      contactPhone
      contactEmail
      isActive
    }
  }
`;

export const UPDATE_VENDOR = gql`
  mutation UpdateVendor($id: ID!, $input: UpdateVendorInput!) {
    updateVendor(id: $id, input: $input) {
      id
      name
      hebrewName
      category
      contactName
      contactPhone
      contactEmail
      alternateContactName
      alternateContactPhone
      address {
        street
        city
        postalCode
        country
      }
      website
      notes
      isActive
      updatedAt
    }
  }
`;

export const DELETE_VENDOR = gql`
  mutation DeleteVendor($id: ID!) {
    deleteVendor(id: $id)
  }
`;

export const TOGGLE_VENDOR_STATUS = gql`
  mutation ToggleVendorStatus($id: ID!) {
    toggleVendorStatus(id: $id) {
      id
      name
      isActive
    }
  }
`;
