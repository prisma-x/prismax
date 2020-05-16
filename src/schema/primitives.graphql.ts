import gql from 'graphql-tag';

export const primitives = gql`
    type BatchPayload {
        count: Int
    }

    type AuthenticationPayload {
        user: User
        token: String!
    }

    enum UserGroup {
        """
        System Administrator
        """
        Admin
        """
        Authenticated User
        """
        User
    }

    """
    Base File Model
    """
    type File
        @model
        @authorization(
            CREATE: [Admin]
            UPDATE: [Admin]
            DELETE: [Admin] #
        ) {
        id: ID!
        createdAt: DateTime!
        updatedAt: DateTime!
        name: String!
        mimetype: String!
        size: Int # Bytes
        path: String! @unique
    }

    """
    Base User Model
    """
    type User
        @model
        @authorization(
            # CREATE: [Admin]
            READ: [Admin, "$user.id == {{id}}"]
            UPDATE: [Admin, "$user.id == {{id}}"]
            DELETE: [Admin] #
        ) {
        id: ID!
        createdAt: DateTime!
        updatedAt: DateTime!
        email: EmailAddress! @unique
        password: Password!
        group: UserGroup!
        name: String!
        avatar: File @upload(accept: ["image/jpeg"], size: { max: "5", min: "0.1" })
    }
`;
