# language: es
@frontend @acceso-unificado
Característica: Acceso unificado desde la cabecera
  El acceso al negocio lleva al inicio de sesión y desde allí se puede crear una cuenta.

  Esquema del escenario: Una sola entrada al negocio en cada idioma
    Cuando un visitante abre la página "<inicio>" del dominio "<dominio>"
    Entonces la cabecera ofrece una sola entrada "<texto>" hacia "<acceso>"
    Cuando abre la entrada al negocio "<texto>"
    Entonces puede crear una cuenta desde el acceso en "<registro>"

    Ejemplos:
      | dominio | inicio | texto        | acceso        | registro          |
      | es      | /      | Ingresar     | /entrar       | /registro         |
      | en      | /      | Sign in      | /sign-in      | /sign-up          |
      | en      | /pt    | Entrar       | /pt/entrar    | /pt/cadastro      |
      | en      | /de    | Anmelden     | /de/anmelden  | /de/registrieren  |
      | en      | /fr    | Se connecter | /fr/connexion | /fr/inscription   |
      | en      | /it    | Accedi       | /it/accedi    | /it/registrazione |

  Escenario: El formulario de acceso envía credenciales sin CAPTCHA
    Cuando un visitante abre la página "/entrar" del dominio "es"
    Entonces el formulario de acceso envía las credenciales sin solicitar CAPTCHA

  Esquema del escenario: Registro sin CAPTCHA en todos los idiomas
    Cuando un visitante abre la página "<registro>" del dominio "<dominio>"
    Entonces puede enviar el registro sin CAPTCHA y ver la confirmación de correo

    Ejemplos:
      | dominio | registro          |
      | es      | /registro         |
      | en      | /sign-up          |
      | en      | /pt/cadastro      |
      | en      | /de/registrieren  |
      | en      | /fr/inscription   |
      | en      | /it/registrazione |

  Esquema del escenario: Recuperación sin CAPTCHA en todos los idiomas
    Cuando un visitante abre la página "<recuperacion>" del dominio "<dominio>"
    Entonces puede solicitar recuperar su contraseña sin CAPTCHA

    Ejemplos:
      | dominio | recuperacion                 |
      | es      | /recuperar-contrasena        |
      | en      | /forgot-password             |
      | en      | /pt/recuperar-senha          |
      | en      | /de/passwort-vergessen       |
      | en      | /fr/mot-de-passe-oublie      |
      | en      | /it/recupero-password        |
