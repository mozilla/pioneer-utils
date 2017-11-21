-- This Source Code Form is subject to the terms of the Mozilla Public
-- License, v. 2.0. If a copy of the MPL was not distributed with this
-- file, You can obtain one at http://mozilla.org/MPL/2.0/.

--[[
# Pioneer: Successful Decryptions
[CEP][] plugin that estimates the number of successful ping decryptions per-day.

[CEP]: https://docs.telemetry.mozilla.org/concepts/data_pipeline.html#hindsight

## Sample Configuration
```lua
filename = 'pioneer_decryptions.lua'
message_matcher = 'Type=="telemetry.metadata" && Fields[docType]=="pioneer-study"'
preserve_data = true
ticker_interval = 60
```

## Sample Output
The output contains a JSON object with some metadata, followed by one row
per-line with a count of the number of successful decryptions for that time
period. CEP should by default be able to generate a graphical chart of this
data for easier parsing.

```
{"time":1511024100,"rows":4,"columns":2,"seconds_per_row":60,"column_info":[{"name":"success","unit":"count","aggregation":"sum"}],"annotations":[]}
nan
3
7
2
```
--]]
require "circular_buffer"

cb = circular_buffer.new(3600, 2, 60)
cb:set_header(1, "success")

function process_message()
  cb:add(read_message("Timestamp"), 1, 1)
  return 0
end

function timer_event()
  inject_payload("cbuf", "successful pioneer decryptions per minute", cb)
end
