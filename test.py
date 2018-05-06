#!/usr/bin/env python
import time
from grovepi import *

# Connect the pump to digital port D4
pump = 4
pinMode(pump,"OUTPUT")

#Sensor connected to A0 Port
sensor = 14             # Pin 14 is A0 Port.
pinMode(sensor,"INPUT")

#Air temperature and humidity sensor connected to port D2
temperature_sensor = 2  


while True:
	# Read soil moisture
	soil = analogRead(sensor)
	# Get value from temperature sensor
	[t,h]=[0,0]
	[t,h] = dht(temperature_sensor,0)
	print("Jordfukt=" , soil , "\t Luftfukt=" , h , "\t Temp=" , t)

	if soil<500:
		time.sleep(1)
		print("Watering!!")
		digitalWrite(pump,1)		# Send HIGH to switch on pump
		time.sleep(0.5)
		digitalWrite(pump,0)		# Send LOW to switch off pump
		time.sleep(4)

	time.sleep(1)

