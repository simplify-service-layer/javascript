# Simplify Service Layer

helper for declarative backend service layer.

## UseCase Example

```typescript
class UserService extends Service {

  public constructor(UserRepository userRepository) {
      this.userRepository = userRepository;
  }

  /**
   * names declaration be used in validation error message
   */
  public getNames() {
    return {
      // basic example
      'token': 'authorized token',
      // dictionary type data key must have '[...]' for subkey naming
      'auth_user': 'authorized user[...]',
      // nested bound name with '{{keyName}}'
      'user_profile': 'profile[...] for {{auth_user}}',
    };
  }

  /**
   * callbacks declaration be run after validation check is passed
   */
  public getCallbacks() {
    return {
      // called after `auth_user` validation check is passed
      'auth_user__session': (authUser) => {
        // session
        Session.setData('auth_user', authUser)
      },
      // called after `auth_user` validation check is passed
      'auth_user__logging': (authUser) => {
        // logging
        Log.write('user id:'+authUser.getId()+' logged in');
      },
    };
  }

  /**
   * loaders declaration be used for loading data
   */
  public getLoaders() {
    return {
      // injected `userRepository` value take from instance properties
      // injected `jwe` value take from loaded data
      'auth_user': (jwe, userRepository) => {
        return userRepository.findById(jwe.sid);
      },
      // injected `token` value take from init input token parameter
      'jwe': (token) => {
        return new JWE(token);
      },
      // result key must be exists
      // result key is output value of service->run
      'result': (authUser) => {
        return authUser;
      },
    };
  }

  /**
   * rule lists declaration be used for validation check
   */
  public getRuleLists() {
    return {
      // ...
    };
  }
}
```
