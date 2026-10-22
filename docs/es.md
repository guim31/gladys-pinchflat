# Pinchflat

Lleve su servidor [Pinchflat](https://github.com/kieraneglin/pinchflat) (el
descargador autoalojado de canales y listas de YouTube, basado en yt-dlp) a
Gladys, a través de su red local: los vídeos descargados hoy, la cola, las
descargas fallidas, los últimos vídeos en un panel y escenas que reaccionan
cuando llega un vídeo nuevo o cuando falla una descarga.

La integración se ha probado con un Pinchflat 2025.9.26 real (la imagen Docker
oficial, descargando un vídeo real), todavía no en una instalación real de
Gladys: sus comentarios son bienvenidos en el
[foro de Gladys](https://community.gladysassistant.com) o en las
[issues](https://github.com/guim31/gladys-pinchflat/issues).

## Lo que necesita

- Gladys Assistant 5.1.0 o posterior.
- Un servidor **Pinchflat**, accesible desde Gladys (misma red), en el puerto de
  su interfaz web (`8945` por defecto).
- Si la interfaz pide una contraseña (`BASIC_AUTH_USERNAME` y
  `BASIC_AUTH_PASSWORD` de Pinchflat), ese usuario y esa contraseña.

## Instalación

1. Instale la integración desde el catálogo de Gladys.
2. En **Configuración**, introduzca la **Dirección** de Pinchflat (por ejemplo
   `192.168.1.2:8945`; sin puerto, se usa `8945`) y, si la interfaz está
   protegida, el **Usuario** y la **Contraseña**.
3. Guarde y haga clic en **Probar la conexión**: el mensaje bajo el botón indica
   la versión de Pinchflat, las fuentes, los vídeos pendientes y los errores.
4. Abra la pestaña **Descubrir**: un dispositivo para el servidor. Haga clic en
   **Añadir**, elija una habitación y guarde.

Opciones:

- **Intervalo de actualización**: de 1 a 10 minutos (2 minutos por defecto).
- **Idioma de los nombres de funciones**: los nombres que reciben las funciones
  al añadir el dispositivo (francés por defecto) y el idioma de la frase de la
  acción de escena.

Pinchflat no tiene API: la integración lee las páginas de su interfaz web (la
lista de fuentes y la página de una fuente), exactamente como un navegador.
Nunca envía un formulario y nunca modifica nada en Pinchflat.

## El dispositivo

Un dispositivo, **Pinchflat** seguido de la dirección del servidor:

| Función                 | Lo que indica                                              |
| ----------------------- | ---------------------------------------------------------- |
| En línea                | 1 cuando Pinchflat responde, 0 si no                       |
| Descargados hoy         | vídeos descargados desde medianoche (hora local de Gladys) |
| Vídeos pendientes       | vídeos por descargar, todas las fuentes juntas             |
| Vídeos con error        | vídeos pendientes cuya última descarga ha fallado          |
| Fuentes                 | canales y listas seguidos                                  |
| Vídeos descargados      | vídeos en el disco, todas las fuentes juntas               |
| Último vídeo descargado | su título y su fuente, como texto                          |

Las cifras cambian en cada lectura. **Vídeos con error** cuenta los errores
mostrados en la primera página de los vídeos pendientes de cada fuente (sus 10
subidas más recientes).

## Panel

El widget **Vídeos de Pinchflat** muestra tres mosaicos (descargados hoy,
pendientes, con error) y la lista de los últimos vídeos descargados: título,
fuente y fecha. Añádalo desde el editor del panel; no necesita ningún ajuste y
funciona incluso antes de añadir el dispositivo.

## Escenas

### Disparadores

- **Vídeo de Pinchflat descargado**: se acaba de descargar un vídeo nuevo de una
  fuente. Filtro: **Fuente** (el nombre del canal o de la lista, exactamente
  como lo muestra Pinchflat; vacío: cualquiera). Información transmitida a las
  acciones: la fuente, el título del vídeo, su fecha de subida a YouTube, la
  página del vídeo en Pinchflat y el número de vídeos descargados hoy.
- **Descarga de Pinchflat fallida**: la descarga de un vídeo pendiente ha
  fallado (vídeo no disponible, solo para miembros, bloqueado, error de
  yt-dlp). Mismo filtro. Información: la fuente, el título, el mensaje de error
  y la página del vídeo.

Cada vídeo se anuncia una sola vez, incluso después de reiniciar la integración.
Lo que Pinchflat ya tenía al iniciarse la integración (o al añadir una fuente)
no se anuncia.

### Acciones

- **Leer los últimos vídeos de Pinchflat**: lee Pinchflat ahora y da una frase
  para un mensaje o un aviso de voz, del tipo «Pinchflat: 2 vídeos descargados
  hoy; últimos: «…» (…), «…» (…). 4 pendientes, 1 con error.», con las cifras
  por separado (descargados hoy, pendientes, con error, título y fuente del
  último vídeo). Opción: el número de vídeos citados en la frase (3 por
  defecto).

### Ideas de escenas

- Cuando se descargue un vídeo de su canal favorito, envíese un mensaje: «Nuevo
  en el servidor multimedia: {título} ({fuente})».
- A las 19 h, lea los últimos vídeos de Pinchflat y anuncie la frase en el
  altavoz del salón.
- Cuando falle una descarga, envíe el mensaje de error, para renovar las
  cookies de yt-dlp o comprobar el vídeo.

## Solución de problemas

- **«Pinchflat no responde»**: compruebe la dirección y el puerto (`8945`), y que
  Gladys puede acceder al servidor (misma red, cortafuegos).
- **«Usuario o contraseña rechazados o ausentes»**: la interfaz está protegida;
  introduzca el `BASIC_AUTH_USERNAME` y el `BASIC_AUTH_PASSWORD` de Pinchflat.
- **«La dirección redirige»**: un proxy inverso envía a una página de acceso o a
  HTTPS; introduzca la dirección directa de Pinchflat en su red.
- **«No hay ningún Pinchflat en esta dirección»**: otro servicio responde en ese
  puerto.
- Ningún evento para un vídeo: Pinchflat ordena los vídeos descargados por fecha
  de subida; un vídeo antiguo descargado tarde (la recuperación de una fuente
  nueva) se cuenta en «Descargados hoy», sin evento de escena.
- Más detalles: ponga el `LOG_LEVEL` de la integración en `debug` y abra sus
  registros.

## Límites

- Solo lectura: la integración no puede añadir una fuente ni iniciar o
  reintentar una descarga (Pinchflat no tiene API para ello).
- Una descarga fallida se detecta en la siguiente lectura de su fuente: en
  menos de 15 minutos. Solo se examinan los 10 vídeos pendientes más recientes
  de cada fuente.
- Se leen como máximo 10 páginas de fuentes por actualización. Con más de 10
  fuentes, Pinchflat solo muestra 10 en su página de fuentes: las demás se leen
  por turnos (10 por actualización), así que sus novedades pueden esperar
  algunas actualizaciones.
- Como máximo 10 eventos de cada tipo por actualización: por encima (una ráfaga
  de descargas), los vídeos se cuentan, pero no se anuncian. Un vídeo eliminado
  mientras otro se descarga, entre dos actualizaciones, puede ocultar esa
  descarga.
- La integración lee las páginas web de Pinchflat 2025.9.26: una versión futura
  que las cambie puede requerir una actualización de la integración.
- Sin relación con Pinchflat, YouTube ni Google.
