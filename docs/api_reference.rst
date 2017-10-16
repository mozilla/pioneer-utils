=============
API Reference
=============

Pioneer Utils
=============

This is the main interaction point for add-on authors.

.. autoclass:: PioneerUtils(config)

   .. autofunction:: getPublicKey
   .. autofunction:: setupEncrypter
   .. autofunction:: getPioneerId
   .. autofunction:: submitEncryptedPing(data)
   .. autofunction:: chooseBranch()

.. autofunction:: Config

Internal
========

These functions are used internally to the utils, and aren't directly
accessible to add-on authors.

.. js:autofunction chooseWeighted(options, hashKey)
.. js:autofunction hashFraction(input)
.. js:autofunction sha256(message)
