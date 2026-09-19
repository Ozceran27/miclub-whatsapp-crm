# Tenant y sectores

El `clubId` se deriva exclusivamente de la sesión. El cliente no puede enviarlo. Toda consulta operativa se filtra por ese tenant. Los sectores se referencian por UUID; `name` y `code` son presentación mutable, nunca claves para maps de saldos o reglas económicas.
