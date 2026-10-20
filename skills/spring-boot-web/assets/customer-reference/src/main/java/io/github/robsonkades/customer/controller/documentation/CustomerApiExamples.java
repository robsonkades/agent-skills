package io.github.robsonkades.customer.controller.documentation;

final class CustomerApiExamples {

    static final String CUSTOMER = """
            {
              "name": "Ana Silva",
              "email": "ana@example.com",
              "phone": "+5511999999999",
              "cpf": "529.982.247-25",
              "birthDate": "1990-05-20",
              "address": {
                "street": "Rua das Flores",
                "number": "123",
                "complement": "Apto 42",
                "neighborhood": "Centro",
                "city": "São Paulo",
                "state": "SP",
                "postalCode": "01001-000"
              }
            }
            """;

    static final String SEARCH_BY_CPF = """
            {
              "filters": [
                {"_discriminator":"cpf","value":"52998224725"}
              ]
            }
            """;

    static final String SEARCH_BY_CPF_AND_EMAIL = """
            {
              "filters": [
                {"_discriminator":"cpf","value":"52998224725"},
                {"_discriminator":"email","value":"ana@example.com"}
              ]
            }
            """;

    static final String SEARCH_BY_PROFILE_AND_LOCATION = """
            {
              "filters": [
                {"_discriminator":"name","operator":"contains","value":"ana"},
                {"_discriminator":"phone","operator":"contains","value":"+5511"},
                {"_discriminator":"birthDateRange","from":"1980-01-01","to":"2000-12-31"},
                {"_discriminator":"address.city","value":"São Paulo"},
                {"_discriminator":"address.state","value":"SP"},
                {"_discriminator":"address.postalCode","value":"01001-000"}
              ],
              "page": 0,
              "size": 20,
              "sort": [
                {"field":"name","direction":"ASC"}
              ]
            }
            """;

    static final String PHONE_PATCH = """
            {
              "phone": "+5511888888888"
            }
            """;

    static final String REMOVE_ADDRESS_COMPLEMENT_PATCH = """
            {
              "address": {
                "street": "Rua das Flores",
                "number": "123",
                "complement": null,
                "neighborhood": "Centro",
                "city": "São Paulo",
                "state": "SP",
                "postalCode": "01001-000"
              }
            }
            """;

    static final String CUSTOMER_RESPONSE = """
            {
              "id": "8a5b22af-0c3e-4cd1-96a7-0b0edc3d5510",
              "name": "Ana Silva",
              "email": "ana@example.com",
              "phone": "+5511999999999",
              "cpf": "52998224725",
              "birthDate": "1990-05-20",
              "address": {
                "street": "Rua das Flores",
                "number": "123",
                "complement": "Apto 42",
                "neighborhood": "Centro",
                "city": "São Paulo",
                "state": "SP",
                "postalCode": "01001-000"
              }
            }
            """;

    static final String CUSTOMER_WITHOUT_COMPLEMENT_RESPONSE = """
            {
              "id": "8a5b22af-0c3e-4cd1-96a7-0b0edc3d5510",
              "name": "Ana Silva",
              "email": "ana@example.com",
              "phone": "+5511999999999",
              "cpf": "52998224725",
              "birthDate": "1990-05-20",
              "address": {
                "street": "Rua das Flores",
                "number": "123",
                "complement": null,
                "neighborhood": "Centro",
                "city": "São Paulo",
                "state": "SP",
                "postalCode": "01001-000"
              }
            }
            """;

    static final String CUSTOMER_PAGE_RESPONSE = """
            {
              "content": [
                {
                  "id": "8a5b22af-0c3e-4cd1-96a7-0b0edc3d5510",
                  "name": "Ana Silva",
                  "email": "ana@example.com",
                  "phone": "+5511999999999",
                  "cpf": "52998224725",
                  "birthDate": "1990-05-20",
                  "address": {
                    "street": "Rua das Flores",
                    "number": "123",
                    "complement": "Apto 42",
                    "neighborhood": "Centro",
                    "city": "São Paulo",
                    "state": "SP",
                    "postalCode": "01001-000"
                  }
                }
              ],
              "page": 0,
              "size": 20,
              "totalElements": 1,
              "totalPages": 1
            }
            """;

    static final String EMPTY_PAGE_RESPONSE = """
            {
              "content": [],
              "page": 0,
              "size": 20,
              "totalElements": 0,
              "totalPages": 0
            }
            """;

    static final String OUT_OF_RANGE_PAGE_RESPONSE = """
            {
              "content": [],
              "page": 1,
              "size": 20,
              "totalElements": 1,
              "totalPages": 1
            }
            """;

    private CustomerApiExamples() {
    }
}
