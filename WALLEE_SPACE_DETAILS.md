# Wallee Space ID - Available Details

When you fetch a Wallee Space using `spacesService.getSpacesId()`, you can retrieve the following details:

## Basic Information
- **id** (Number) - The unique Space ID
- **name** (String) - Space/merchant name
- **state** (String) - Current state (e.g., "ACTIVE", "INACTIVE", "DELETED")
- **version** (Number) - Version number for optimistic locking

## Currency & Configuration
- **primaryCurrency** (String) - Primary currency code (e.g., "CHF", "EUR", "USD")
- **requestLimit** (Number) - API request limit per month
- **timeZone** (String) - Timezone of the space

## Administrator Information
- **administratorEmail** (String) - Email of the administrator
- **administratorFirstName** (String) - First name of administrator
- **administratorLastName** (String) - Last name of administrator
- **administratorLocale** (String) - Locale setting (e.g., "en_US", "de_CH")

## Contact Information
- **technicalContactAddresses** (Array<String>) - Array of technical contact email addresses
- **postalAddress** (Object) - Postal address information:
  - `emailAddress` (String)
  - `country` (String) - ISO country code
  - `postcode` (String)
  - `city` (String)
  - `street` (String)
  - `state` (String) - Optional

## Account & Payment Configuration
- **account** (Object) - Reference to the associated account:
  - `id` (Number) - Account ID
- **paymentMethodConfigurations** (Array) - Configured payment methods (may require additional API calls)
- **bankAccounts** (Array) - Bank account information (may require additional API calls)

## Timestamps
- **createdOn** (Date/ISO String) - When the space was created
- **updatedOn** (Date/ISO String) - Last update timestamp
- **plannedPurgeDate** (Date/ISO String) - Planned deletion date (if space is marked for deletion)

## Additional Fields (may vary)
- **logo** (String) - Logo URL or reference
- **requestLimit** (Number) - API request limit
- Other fields as per Wallee API version

## Example Response Structure

```javascript
{
  id: 12345,
  name: "Merchant Name",
  state: "ACTIVE",
  primaryCurrency: "CHF",
  requestLimit: 1000,
  administratorEmail: "admin@merchant.com",
  administratorFirstName: "John",
  administratorLastName: "Doe",
  administratorLocale: "en_US",
  technicalContactAddresses: ["tech@merchant.com"],
  postalAddress: {
    emailAddress: "contact@merchant.com",
    country: "CH",
    postcode: "8001",
    city: "Zurich",
    street: "Main Street 1"
  },
  account: {
    id: 67890
  },
  createdOn: "2024-01-01T00:00:00Z",
  updatedOn: "2024-01-15T10:30:00Z",
  timeZone: "Europe/Zurich",
  version: 1
}
```

## Usage in Code

```javascript
const space = await spacesService.getSpacesId({
  id: spaceIdNumber,
});

// Access fields
console.log(space.name);           // Merchant name
console.log(space.state);          // "ACTIVE", "INACTIVE", etc.
console.log(space.primaryCurrency); // "CHF"
console.log(space.administratorEmail); // Admin email
console.log(space.postalAddress);  // Full address object
```

## Notes

1. **Payment Methods & Bank Accounts**: These may require separate API calls to fetch detailed information
2. **State Values**: Common states include "ACTIVE", "INACTIVE", "DELETED", "RESTRICTED"
3. **Currency**: Must be a valid ISO 4217 currency code
4. **Version**: Used for optimistic locking when updating the space
